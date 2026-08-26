"""docs/design_doc.md 7章の POST /api/ai/transform に対応する変換ロジック。

中身は `ai/transform_api.py` にある。ここは薄い入口である。

置き換え前は「疲れた→つかれたぁ〜」のような3語の置換だけを行う
プレースホルダーだった。人間監督の指示により、Gemini を使う実装へ差し替えた。
"""

from __future__ import annotations

import sys
from pathlib import Path

# app.py と同じ階層に transform_api.py がある。
# uvicorn は ai/ を作業ディレクトリにして起動するので通常は通るが、
# 別の場所から読み込まれても動くようにしておく。
_AI_DIR = str(Path(__file__).resolve().parent.parent)
if _AI_DIR not in sys.path:
    sys.path.insert(0, _AI_DIR)

import transform_api


def transform(body: str, style: str) -> dict:
    """文章を赤ちゃん言葉・お母さん言葉へ変換し、判定つきで返す。

    Args:
        body: 変換したい文章。100文字以内
        style: "baby" または "mother"

    Returns:
        {"action", "transformedText", "reasonCodes"}

    Raises:
        ValueError: 入力が不正（空文字列、style 違い、100文字超）
        RuntimeError: 変換APIが使えない（レート制限、認証、空応答など）
    """
    return transform_api.transform(style, body)


def moderate(body: str) -> dict:
    """文章を判定する。**通信しない。**

    問題のある語があれば block、無ければ allow。
    **赤ちゃん語・ママ語になっているかは判定しない。** 人間監督の決定により
    採点基準を置かないため（学習データから得られる判断と食い違う）。

    変換APIが止まっていても動く。利用回数の制限も受けない。

    Args:
        body: 判定したい文章。150文字以内

    Returns:
        {"action", "reasonCodes"}

    Raises:
        ValueError: 入力が不正（空文字列、150文字超）
    """
    return transform_api.moderate(body)
