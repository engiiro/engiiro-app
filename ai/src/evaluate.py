"""
docs/design_doc.md 7章の POST /api/ai/evaluate に対応する評価ロジック。

ここでは応答の `estimatedAge`（何歳児相当かの目安）のみを扱う。保存可否を決める
`passesThreshold`（FR-AI-EVAL-007）は `src/style_classifier.py` のナイーブベイズ
3クラス分類器が担当する（`app.py` 参照）。

`estimatedAge` は最初はシンプルなルールベースのプレースホルダーとし、
後からPyTorch/scikit-learnで学習したモデルに差し替える想定
（design_doc.md 8章「開発の進め方」参照）。
"""

BABY_WORDS = ["まんま", "ねんね", "だっこ", "ばぶ", "おぎゃー"]
MOTHER_WORDS = ["よしよし", "だいじょうぶ", "がんばったね", "えらいね"]


def evaluate(body: str, persona_type: str) -> float:
    """
    body の文章から推定年齢(何歳児相当)を返すプレースホルダー実装。
    persona_type: "baby" | "mother"
    """
    keywords = BABY_WORDS if persona_type == "baby" else MOTHER_WORDS
    hits = sum(1 for w in keywords if w in body)

    # TODO: 実際のモデルによる推定に置き換える。
    # とりあえず「幼い言葉が多いほど年齢が低い」という雑なルールで返す。
    base_age = 6.0
    estimated_age = max(0.0, base_age - hits * 1.5)
    return round(estimated_age, 1)
