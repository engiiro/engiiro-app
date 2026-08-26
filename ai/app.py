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
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from src.evaluate import evaluate
from src.transform import moderate, transform

app = FastAPI(title="engiiro-app AI service")


class EvaluateRequest(BaseModel):
    body: str
    personaType: str  # "baby" | "mother"


class EvaluateResponse(BaseModel):
    estimatedAge: float


class TransformRequest(BaseModel):
    body: str
    style: str  # "baby" | "mother"


class TransformResponse(BaseModel):
    """判定の内訳は返さない（FR-AI-TRANS-009）。"""

    action: str                      # "allow" | "rewrite_required" | "block"
    transformedText: str | None
    reasonCodes: list[str]


class ModerateRequest(BaseModel):
    body: str


class ModerateResponse(BaseModel):
    """判定の内訳は返さない（FR-MOD-034）。"""

    action: str
    reasonCodes: list[str]


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/evaluate", response_model=EvaluateResponse)
def post_evaluate(req: EvaluateRequest):
    try:
        estimated_age = evaluate(req.body, req.personaType)
    except ValueError as exc:
        # 入力が不正。呼び出し側が直せるので 400
        # 現在の evaluate は投げないが、PR #40 で空文字列と未対応の
        # personaType を拒むようになる。何もしないと 500 になる。
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return EvaluateResponse(estimatedAge=estimated_age)


@app.post("/transform", response_model=TransformResponse)
def post_transform(req: TransformRequest):
    try:
        result = transform(req.body, req.style)
    except ValueError as exc:
        # 入力が不正。呼び出し側が直せるので 400
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        # 推論APIが使えない。時間をおけば直る可能性があるので 503
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return TransformResponse(**result)


@app.post("/moderate", response_model=ModerateResponse)
def post_moderate(req: ModerateRequest):
    """判定だけを行う。通信しないので、推論APIが止まっていても動く。"""
    try:
        result = moderate(req.body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ModerateResponse(
        action=result["action"],
        reasonCodes=result["reasonCodes"],
    )
