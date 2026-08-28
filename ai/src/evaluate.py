"""
docs/design_doc.md 7章の POST /api/ai/evaluate に対応する評価ロジック。

`estimatedAge`（何歳児相当かの目安）を、`passesThreshold`（FR-AI-EVAL-007）と
同じ src/style_classifier.py のナイーブベイズ3クラス分類器から算出する
（人間監督の決定、2026-08-28。以前はキーワード一致数だけを見る別の仮実装で、
辞書変換が生成する語（「ばぐばぐ」等）を1つも拾えず実質常に最大値を返していた）。

分類器が返す「度合い」（personaTypeに対応するクラスの確率、0〜100）を、
そのまま0〜72ヶ月へ線形変換する。度合いが高い（そのpersonaTypeらしい文章で
あるほど確信度が高い）ほど月齢は低く、passesThresholdの閾値50と同じ基準を
共有する（閾値ぎりぎりの文章はだいたい3歳前後に来る）。
"""

from src.style_classifier import MAX_MONTHS, degree_of

BASE_AGE_MONTHS = float(MAX_MONTHS)


def evaluate(body: str, persona_type: str) -> float:
    """
    body の文章から推定年齢(何歳児相当、単位は歳の小数)を返す。
    persona_type: "baby" | "mother"
    """
    degree = degree_of(body, persona_type)  # 0〜100
    estimated_months = BASE_AGE_MONTHS * (1 - degree / 100)
    return round(estimated_months / 12, 1)
