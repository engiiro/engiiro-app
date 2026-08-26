"""
docs/design_doc.md 7章のAI推論API（評価・変換・判定）のエントリーポイント。
Hugging Face Spaces（Docker SDK）にそのままデプロイする想定。

    /evaluate   文章から年齢の目安を返す（FR-AI-EVAL-*）
    /transform  文章を赤ちゃん言葉・お母さん言葉へ変換する（FR-AI-TRANS-*）
    /moderate   文章を判定する（FR-MOD-*）。**通信しないので利用回数の制限が無い**

`/transform` だけが外部の推論APIを使う。`/moderate` は形態素解析と辞書だけで
動くため、推論APIが止まっていても使える。利用者が自分で赤ちゃん語を書いた場合は
`/moderate` だけで投稿の可否を決められる。

APIキーは環境変数 GOOGLE_API_KEY から読む。コードへ直接書かない。

## 入口の守り（Issue #47）

企業側の破壊テストを前提に、境界で次を閉じている。実装は `ai/api_security.py`。

    本文のバイト数上限   4096バイト。Pydanticが読む前に切る
    厳格なスキーマ       未知フィールド・型違い・未知persona・空白のみを拒否
    連打の制限          /transform は低め、/moderate と /evaluate は高め
    内部認証            secret が設定されていれば、一致しない要求を拒否
    エラーの固定化       str(exc) を返さない。安定したコードと requestId だけ

**内部関数側の検査は残してある。** 境界とコアの二重で見る。
片方を変えたときにもう片方が効く形にしておくためである。
"""

from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator

import api_security as security
from transform_api import MAX_INPUT_CHARS, MAX_TRANSFORM_INPUT_CHARS
from src.evaluate import evaluate
from src.transform import moderate, transform

app = FastAPI(title="engiiro-app AI service")

# 本文が大きすぎる要求を、ルーティングより前で切る。
# **BaseHTTPMiddleware ではなく生のASGIで書いてある。** あちらは本文を
# 全部読んでしまうので、大きい本文を弾く目的には使えない。
app.add_middleware(security.BodySizeLimitMiddleware)


# ============================================================
# 要求と応答（P0-2）
# ============================================================
# HTTP境界でも文字数と persona を縛る。内部の検査と二重になるが、
# **境界で落としたほうが、壊れた要求が奥まで進まない。**

Persona = Literal["baby", "mother"]


class StrictRequest(BaseModel):
    """3つの入口で共通の決まり。

    - **未知フィールドは拒否する**（`extra="forbid"`）。
      受け付けると、綴り違いのフィールドが黙って無視されて気づけない
    - 空白だけの本文は拒否する。`min_length` だけでは通ってしまう
    """

    model_config = ConfigDict(extra="forbid")

    @field_validator("body", check_fields=False)
    @classmethod
    def _not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("空白だけの本文は受け付けません。")
        return value


class EvaluateRequest(StrictRequest):
    body: str = Field(min_length=1, max_length=MAX_INPUT_CHARS)
    personaType: Persona


class EvaluateResponse(BaseModel):
    estimatedAge: float


class TransformRequest(StrictRequest):
    body: str = Field(min_length=1, max_length=MAX_TRANSFORM_INPUT_CHARS)
    style: Persona


class TransformResponse(BaseModel):
    """判定の内訳は返さない（FR-AI-TRANS-009）。"""

    action: str                      # "allow" | "rewrite_required" | "block"
    transformedText: str | None
    reasonCodes: list[str]


class ModerateRequest(StrictRequest):
    body: str = Field(min_length=1, max_length=MAX_INPUT_CHARS)


class ModerateResponse(BaseModel):
    """判定の内訳は返さない（FR-MOD-034）。"""

    action: str
    reasonCodes: list[str]


# ============================================================
# エラーの固定化（P1-3）
# ============================================================


class ApiError(Exception):
    """外へ返すエラー。**内部の説明を持たせない。**"""

    def __init__(self, code: str, detail: str = ""):
        super().__init__(code)
        self.code = code
        self.detail = detail        # 内部ログ用。応答には入れない


def _fail(code: str, request_id: str, detail: str = "") -> JSONResponse:
    security.log_problem(code, request_id, detail)
    return JSONResponse(
        status_code=security.STATUS_FOR_CODE[code],
        content=security.error_payload(code, request_id),
    )


@app.exception_handler(ApiError)
async def _handle_api_error(request: Request, exc: ApiError):
    return _fail(exc.code, security.new_request_id(), exc.detail)


@app.exception_handler(RequestValidationError)
async def _handle_validation_error(request: Request, exc: RequestValidationError):
    """Pydanticの詳細は返さない。

    既定の422は、どのフィールドがどう不正かを細かく返す。
    入口の構造を教えることになるので、`invalid_request` に寄せる。
    """
    return _fail(security.ErrorCode.INVALID_REQUEST, security.new_request_id(),
                 f"validation: {len(exc.errors())} 件")


@app.exception_handler(HTTPException)
async def _handle_http_exception(request: Request, exc: HTTPException):
    code = {
        400: security.ErrorCode.INVALID_REQUEST,
        401: security.ErrorCode.UNAUTHORIZED,
        413: security.ErrorCode.PAYLOAD_TOO_LARGE,
        429: security.ErrorCode.RATE_LIMITED,
        503: security.ErrorCode.AI_UNAVAILABLE,
    }.get(exc.status_code, security.ErrorCode.INTERNAL_ERROR)
    return _fail(code, security.new_request_id(), f"http {exc.status_code}")


@app.exception_handler(Exception)
async def _handle_unexpected(request: Request, exc: Exception):
    """想定外の例外。**stack trace を外へ出さない。**"""
    return _fail(security.ErrorCode.INTERNAL_ERROR, security.new_request_id(),
                 type(exc).__name__)


# ============================================================
# 入口ごとの守り（P1-1 / P1-2）
# ============================================================


def require_secret(
    x_engiiro_ai_secret: str | None = Header(default=None),
) -> None:
    """backend以外からの要求を閉じる。

    `ENGIIRO_AI_API_SECRET` が設定されていない環境では検査しない。
    手元とCIを壊さないためである。**設定されていれば必ず検査する。**

    backend 側は次のヘッダーを付けて呼ぶ契約になる。
    backend のコードはこのPRでは触らない。

        X-Engiiro-Ai-Secret: <secret>
    """
    if not security.check_secret(x_engiiro_ai_secret):
        raise ApiError(security.ErrorCode.UNAUTHORIZED, "secret mismatch")


def _limit(request: Request, limiter: security.RateLimiter) -> None:
    client = security.client_key(request.client.host if request.client else None)
    if not limiter.allow(client):
        raise ApiError(security.ErrorCode.RATE_LIMITED, f"limiter={limiter.name}")


def limit_transform(request: Request) -> None:
    """`/transform` の上限。**1回ごとにGeminiの枠を使うので低い。**"""
    _limit(request, security.transform_limiter)


def limit_local(request: Request) -> None:
    """`/moderate` `/evaluate` の上限。手元の計算だけなので高い。"""
    _limit(request, security.local_limiter)


# ============================================================
# 入口
# ============================================================


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/evaluate", response_model=EvaluateResponse,
          dependencies=[Depends(require_secret), Depends(limit_local)])
def post_evaluate(req: EvaluateRequest):
    try:
        estimated_age = evaluate(req.body, req.personaType)
    except ValueError as exc:
        # 入力が不正。境界で縛ってあるので通常は来ない
        raise ApiError(security.ErrorCode.INVALID_REQUEST, str(type(exc).__name__)) from exc
    return EvaluateResponse(estimatedAge=estimated_age)


@app.post("/transform", response_model=TransformResponse,
          dependencies=[Depends(require_secret), Depends(limit_transform)])
def post_transform(req: TransformRequest):
    try:
        result = transform(req.body, req.style)
    except ValueError as exc:
        raise ApiError(security.ErrorCode.INVALID_REQUEST, type(exc).__name__) from exc
    except RuntimeError as exc:
        # 推論APIが使えない、または混み合っている。時間をおけば直る可能性がある。
        # **例外文をそのまま返さない。** モデル名や設定手順が入っている
        raise ApiError(security.ErrorCode.AI_UNAVAILABLE, type(exc).__name__) from exc
    return TransformResponse(**result)


@app.post("/moderate", response_model=ModerateResponse,
          dependencies=[Depends(require_secret), Depends(limit_local)])
def post_moderate(req: ModerateRequest):
    """判定だけを行う。通信しないので、推論APIが止まっていても動く。"""
    try:
        result = moderate(req.body)
    except ValueError as exc:
        raise ApiError(security.ErrorCode.INVALID_REQUEST, type(exc).__name__) from exc
    return ModerateResponse(
        action=result["action"],
        reasonCodes=result["reasonCodes"],
    )
