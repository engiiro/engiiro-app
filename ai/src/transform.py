"""
docs/design_doc.md 7章の POST /api/ai/transform に対応する変換ロジック。

最初は簡易的な置換ベースのプレースホルダー。
生成AI（外部API or ローカルLLM）に差し替えるかは design_doc.md 10章の
オープンイシューとして未決定。
"""

BABY_REPLACEMENTS = {
    "疲れた": "つかれたぁ〜",
    "つらい": "しんどいよぉ",
    "無理": "むりぃ〜",
}

MOTHER_REPLACEMENTS = {
    "疲れた": "よく頑張ったね、おつかれさま",
    "つらい": "しんどかったね、よしよし",
    "無理": "無理しなくていいよ、大丈夫",
}


def transform(body: str, style: str) -> str:
    """
    body の文章を赤ちゃん言葉 / お母さん言葉に変換するプレースホルダー実装。
    style: "baby" | "mother"
    """
    replacements = BABY_REPLACEMENTS if style == "baby" else MOTHER_REPLACEMENTS

    result = body
    for original, replaced in replacements.items():
        result = result.replace(original, replaced)

    # TODO: 実際は生成AI（外部API or ローカルLLM）に置き換える
    return result
