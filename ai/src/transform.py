"""
docs/design_doc.md 7章の POST /api/ai/transform に対応する変換ロジック。
docs/ai_transform_design.md の実装。

一次経路はGemini API（ai/transform_api.py、Issue #15）によるプロンプトチューニング
変換。Gemini APIがタイムアウト・エラー・レート制限などで応答できないときは、
外部通信をしないルールベースのフォールバック（ai/src/fallback/）へ切り替える。

サーバー運用時にGemini APIへのリクエストが集中すると応答が間に合わなくなる
可能性がある、という懸念（人間監督）への対応。
"""

from __future__ import annotations

import os
import sys
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeoutError
from pathlib import Path
from typing import Literal, TypedDict

# 直接実行（`python src/transform.py`）したときも、ai/ 直下のモジュール
# （transform_api、moderation_rules、dictionaries）を解決できるようにする。
# `ai/app.py` 経由で起動した場合はすでに ai/ が sys.path に入っているため、
# ここでの追加は重複するだけで害はない。
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import transform_api  # noqa: E402  (sys.path調整の後に置く必要がある)
from dictionaries.harsh_word_softeners import HARSH_WORD_SOFTENERS  # noqa: E402
from moderation_rules import check_rules  # noqa: E402
from src.fallback.baby_fallback import to_baby_words  # noqa: E402
from src.fallback.dictionary_match import replace_longest_match  # noqa: E402
from src.fallback.mother_fallback import to_mother_words  # noqa: E402

Style = Literal["baby", "mother"]

# Gemini API呼び出しの待機上限（秒）。環境変数で変更できる。公開HTTPリクエストが
# 1件のためにworkerを長時間占有しないよう、保守的な短い値を既定にしている
# （docs/ai_transform_design.md 4章）。
DEFAULT_TIMEOUT_SECONDS = float(os.getenv("AI_TRANSFORM_TIMEOUT_SECONDS", "4.0"))

# Gemini呼び出しを別スレッドで実行し、時間切れなら呼び出し元へ制御を返すために使う。
# `future.result(timeout=...)`はタイムアウトしても背後のスレッドを止められないため、
# 同時に実行できるスレッド数を絞ってリソースの使いすぎを防ぐ。
_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="ai-transform-gemini")


class TransformResult(TypedDict):
    action: Literal["allow", "block"]
    transformedText: str | None
    reasonCodes: list[str]


def _call_gemini_with_timeout(style: Style, text: str, timeout_seconds: float) -> str:
    """Geminiでの変換を試みる。`timeout_seconds`以内に終わらなければ例外を送出する。"""
    future = _executor.submit(transform_api.transform_text, style, text)
    return future.result(timeout=timeout_seconds)


def _fallback_transform(text: str, style: Style) -> str:
    """Gemini APIを使わない、規則ベースの変換（docs/ai_transform_design.md 6章）。"""
    if style == "baby":
        return to_baby_words(text)
    return to_mother_words(text)


def transform(body: str, style: str) -> TransformResult:
    """`POST /api/ai/transform`の中身。

    処理の流れ（docs/ai_transform_design.md 3章）：
      1. 事前モデレーション（block なら Gemini・フォールバックのどちらにも渡さない）
      2. NGワードの端処理（マサカリ寄りの語だけを穏当化）
      3. Geminiで変換を試みる。失敗・タイムアウトならフォールバックへ切り替える
      4. 事後モデレーション
    """
    softened = replace_longest_match(body, HARSH_WORD_SOFTENERS)

    before_verdict = check_rules(softened)
    if before_verdict["action"] == "block":
        return {
            "action": "block",
            "transformedText": None,
            "reasonCodes": before_verdict["reasonCodes"],
        }

    try:
        transformed_text = _call_gemini_with_timeout(
            style, softened, DEFAULT_TIMEOUT_SECONDS
        )
    except (RuntimeError, FutureTimeoutError):
        # RuntimeError: APIキー未設定・レート制限・認証エラー・空応答など
        #               （ai/transform_api.py の _raise_readable が投げる）。
        # FutureTimeoutError: DEFAULT_TIMEOUT_SECONDS以内に応答が返らなかった。
        # どちらも「Geminiが今は使えない」という状況であり、フォールバックへ
        # 切り替える。ValueError（入力そのものが不正）はここでは捕まえず、
        # 呼び出し元にそのまま伝える。
        transformed_text = _fallback_transform(softened, style)

    after_verdict = check_rules(transformed_text)
    if after_verdict["action"] == "block":
        return {
            "action": "block",
            "transformedText": None,
            "reasonCodes": after_verdict["reasonCodes"],
        }

    return {"action": "allow", "transformedText": transformed_text, "reasonCodes": []}


if __name__ == "__main__":
    # GOOGLE_API_KEY が無い環境でも、フォールバック経路の動作確認ができる。
    samples: list[tuple[str, Style]] = [
        ("今日は疲れました。エラーが発生したので確認してください。", "baby"),
        ("今日は疲れました。エラーが発生したので確認してください。", "mother"),
        ("あいつは無能だ。", "baby"),
    ]
    for sample_body, sample_style in samples:
        print(f"入力({sample_style}): {sample_body}")
        print(f"出力: {transform(sample_body, sample_style)}")
        print()
