"""AI APIの入口を守る。Issue #47。

正常系の精度ではなく、**API境界と実行資源の防御**だけを扱う。
判定そのものは transform_api / moderation_rules が担当する。

ここが守るもの:

    P0-1  本文のバイト数上限        BodySizeLimitMiddleware
    P1-1  連打の制限              RateLimiter
    P1-2  backend以外からの遮断    check_secret
    P1-3  外向けエラーの固定化      ErrorCode / error_payload

## できないこと

**アプリ単体でDDoSは防げない。** ここでできるのは
「1プロセスが1つの相手から壊されにくくする」までである。
分散した攻撃、複数workerをまたぐ合計、帯域の飽和は防げない。
そこはWAF・CDN・ロードバランサ側の仕事であり、このモジュールは代わりにならない。

**rate limit は1プロセス内でしか数えていない。** worker を増やすと
上限は worker 数だけ緩くなる。Hugging Face Spaces の1プロセス構成を前提にしている。

## 既定値の根拠（実測）

    正当な要求の最大バイト数（/evaluate 150文字を \\uXXXX で書いた場合）  937 bytes
      → MAX_BODY_BYTES = 4096（4倍の余裕）
    判定API 1件あたり                                                6.0 ms（中央値）
      → 1コアで理論値 約9,900件/分。120件/分なら負荷にならない

変えるときは環境変数で上書きする。コードへ直接書かない。
"""

from __future__ import annotations

import hmac
import json
import os
import sys
import threading
import time
import uuid
from collections import OrderedDict

# ============================================================
# 外向けのエラーコード（P1-3）
# ============================================================
# **str(exc) をそのまま返さない。** 例外文にはモデル名、endpoint URL、
# APIキーが設定されているかどうか、内部の待ち時間が入りうる。
# 攻撃側にとっては内部構成の手がかりになるので、安定した短いコードへ寄せる。
# 詳しい内容は requestId を頼りに内部ログ側で追う。


class ErrorCode:
    INVALID_REQUEST = "invalid_request"
    PAYLOAD_TOO_LARGE = "payload_too_large"
    RATE_LIMITED = "rate_limited"
    UNAUTHORIZED = "unauthorized"
    AI_UNAVAILABLE = "ai_unavailable"
    INTERNAL_ERROR = "internal_error"


STATUS_FOR_CODE = {
    ErrorCode.INVALID_REQUEST: 400,
    ErrorCode.PAYLOAD_TOO_LARGE: 413,
    ErrorCode.RATE_LIMITED: 429,
    ErrorCode.UNAUTHORIZED: 401,
    ErrorCode.AI_UNAVAILABLE: 503,
    ErrorCode.INTERNAL_ERROR: 500,
}


def new_request_id() -> str:
    """内部ログと外向け応答を突き合わせるための識別子。"""
    return uuid.uuid4().hex[:16]


def error_payload(code: str, request_id: str) -> dict:
    """外へ返す本文。**これ以外の情報を足さないこと。**"""
    return {"error": code, "requestId": request_id}


def log_problem(code: str, request_id: str, detail: str = "") -> None:
    """内部ログへ残す。**投稿原文・個人情報・secret は書かない。**

    detail には例外の種類や短い説明だけを渡すこと。
    利用者が書いた文章を渡してはいけない。
    """
    line = f"[ai] {code} requestId={request_id}"
    if detail:
        line += f" {detail[:200]}"
    print(line, file=sys.stderr, flush=True)


# ============================================================
# P0-1. 本文のバイト数上限
# ============================================================
# 100/150文字という業務上の上限とは別に、HTTP本文そのものへ上限を置く。
# 業務上限だけだと、Pydantic が巨大なJSONを全部読んでから弾くことになる。
# 200KB の本文が 400 で返ることを実測した（読む処理は走ってしまっている）。

DEFAULT_MAX_BODY_BYTES = 4096
MAX_BODY_BYTES_VAR = "ENGIIRO_MAX_BODY_BYTES"


def max_body_bytes() -> int:
    """本文の上限。壊れた値が入っていたら既定へ落とす。"""
    raw = os.getenv(MAX_BODY_BYTES_VAR)
    if not raw:
        return DEFAULT_MAX_BODY_BYTES
    try:
        value = int(raw)
    except ValueError:
        return DEFAULT_MAX_BODY_BYTES
    return value if value > 0 else DEFAULT_MAX_BODY_BYTES


async def _send_json(send, status: int, payload: dict) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    await send({
        "type": "http.response.start",
        "status": status,
        "headers": [
            (b"content-type", b"application/json; charset=utf-8"),
            (b"content-length", str(len(body)).encode("ascii")),
        ],
    })
    await send({"type": "http.response.body", "body": body})


class BodySizeLimitMiddleware:
    """本文が大きすぎる要求を、アプリへ渡す前に切る。

    **Content-Length だけを信用しない。** 申告が無い場合（chunked相当）や
    嘘の申告に備えて、**実際に読んだbyte数**でも数える。
    申告があって上限を超えている場合は、本文を読まずに落とす。

    上限までは読み込んで持つ。上限が数KBなので、これで消費するメモリは高が知れている。
    逆に「読まずにアプリへ流す」ことはできない。ASGIでは本文を一度しか読めないため、
    数えた本文をアプリへ渡し直す必要がある。

    starlette の BaseHTTPMiddleware は使わない。あちらは本文を全部
    読んでしまうので、**大きい本文を弾く目的には使えない。**
    """

    #: 本文を持つ可能性があるメソッドだけを見る
    METHODS_WITH_BODY = frozenset({"POST", "PUT", "PATCH"})

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http" or scope.get("method") not in self.METHODS_WITH_BODY:
            await self.app(scope, receive, send)
            return

        limit = max_body_bytes()
        request_id = new_request_id()

        # 申告が上限を超えているなら、本文を読まずに落とす
        declared = _declared_length(scope)
        if declared is not None and declared > limit:
            log_problem(ErrorCode.PAYLOAD_TOO_LARGE, request_id,
                        f"content-length={declared} limit={limit}")
            await _send_json(send, STATUS_FOR_CODE[ErrorCode.PAYLOAD_TOO_LARGE],
                             error_payload(ErrorCode.PAYLOAD_TOO_LARGE, request_id))
            return

        chunks: list[bytes] = []
        total = 0
        more = True
        while more:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body") or b""
            total += len(chunk)
            if total > limit:
                # ここで打ち切る。残りは読まない
                log_problem(ErrorCode.PAYLOAD_TOO_LARGE, request_id,
                            f"read={total} limit={limit}")
                await _send_json(send, STATUS_FOR_CODE[ErrorCode.PAYLOAD_TOO_LARGE],
                                 error_payload(ErrorCode.PAYLOAD_TOO_LARGE, request_id))
                return
            chunks.append(chunk)
            more = message.get("more_body", False)

        body = b"".join(chunks)
        replayed = False

        async def replay():
            nonlocal replayed
            if not replayed:
                replayed = True
                return {"type": "http.request", "body": body, "more_body": False}
            return await receive()

        await self.app(scope, replay, send)


def _declared_length(scope) -> int | None:
    """Content-Length の申告を取り出す。読めなければ None。"""
    for name, value in scope.get("headers") or []:
        if name == b"content-length":
            try:
                return int(value)
            except ValueError:
                return None
    return None


# ============================================================
# P1-1. 連打の制限
# ============================================================
# **/transform と /moderate を同じ上限にしない。**
# /transform は1回ごとに Gemini の枠を使うので、枯らされると
# サービス全体が止まる。/moderate と /evaluate は手元の計算だけなので、
# 同じ厳しさにすると普通の利用が先に詰まる。

DEFAULT_TRANSFORM_PER_MINUTE = 6     # Geminiの枠を消費するので低く
DEFAULT_LOCAL_PER_MINUTE = 120       # 手元の計算だけ。1件6msなので余裕がある

TRANSFORM_RATE_VAR = "ENGIIRO_TRANSFORM_PER_MINUTE"
LOCAL_RATE_VAR = "ENGIIRO_LOCAL_PER_MINUTE"

#: 相手ごとに1つずつ数える。増えすぎたら古いものから捨てる
MAX_TRACKED_CLIENTS = 4096


class RateLimiter:
    """トークンバケツ。1プロセス内でだけ数える。

    **X-Forwarded-For を見ない。** 誰でも書けるヘッダーなので、
    見てしまうと1行足すだけで上限を回避できる。
    信頼できるプロキシの内側に置く構成になったら、そこで初めて
    「どのヘッダーを信じるか」を決める話になる。

    覚えている相手が増えすぎたら、古いものから捨てる。
    捨てられた相手は上限が戻るが、**際限なくメモリを食うほうが危ない。**
    """

    def __init__(self, name: str, env_var: str, default_per_minute: int):
        self.name = name
        self._env_var = env_var
        self._default = default_per_minute
        self._lock = threading.Lock()
        self._buckets: OrderedDict[str, tuple[float, float]] = OrderedDict()

    def per_minute(self) -> int:
        """上限。0以下や壊れた値なら既定へ落とす。"""
        raw = os.getenv(self._env_var)
        if not raw:
            return self._default
        try:
            value = int(raw)
        except ValueError:
            return self._default
        return value if value > 0 else self._default

    def allow(self, client: str, now: float | None = None) -> bool:
        """1回分を使う。上限に達していたら False。"""
        limit = self.per_minute()
        now = time.monotonic() if now is None else now
        refill_per_second = limit / 60.0

        with self._lock:
            tokens, last = self._buckets.get(client, (float(limit), now))
            tokens = min(float(limit), tokens + (now - last) * refill_per_second)

            allowed = tokens >= 1.0
            if allowed:
                tokens -= 1.0

            self._buckets[client] = (tokens, now)
            self._buckets.move_to_end(client)
            while len(self._buckets) > MAX_TRACKED_CLIENTS:
                self._buckets.popitem(last=False)

        return allowed

    def reset(self) -> None:
        """テスト用。数えた内容を捨てる。"""
        with self._lock:
            self._buckets.clear()


transform_limiter = RateLimiter("transform", TRANSFORM_RATE_VAR,
                               DEFAULT_TRANSFORM_PER_MINUTE)
local_limiter = RateLimiter("local", LOCAL_RATE_VAR, DEFAULT_LOCAL_PER_MINUTE)


def client_key(client_host: str | None) -> str:
    """数える単位。接続元のIPだけを使う。

    ヘッダーを見ないので、同じNATの内側にいる利用者はまとめて数えられる。
    上限を緩めではなく厳しめに効かせる方向の誤差なので、そのままにしている。
    """
    return client_host or "unknown"


# ============================================================
# P1-2. backend以外からの遮断
# ============================================================
# AI APIが公開URLへ出ても、backend経由以外を閉じられるようにする。
# **CORS は認証の代わりにならない。** ブラウザ以外からの要求には効かない。

SECRET_VAR = "ENGIIRO_AI_API_SECRET"
SECRET_HEADER = "X-Engiiro-Ai-Secret"


def secret_required() -> bool:
    """secret が設定されている環境かどうか。

    設定されていなければ検査しない。手元とCIを壊さないためである。
    本番では設定する前提で、**設定されていれば必ず検査する。**
    """
    return bool(os.getenv(SECRET_VAR))


def check_secret(provided: str | None) -> bool:
    """一致するか。**secret はログにも応答にも出さない。**"""
    expected = os.getenv(SECRET_VAR)
    if not expected:
        return True
    if not provided:
        return False
    # 文字ごとの比較時間で中身を推測されないようにする
    return hmac.compare_digest(provided, expected)
