"""文末記号（。！？）で文章を複数の文へ分割する。

投稿本文は複数の文からなることが多い（例：「今日は疲れました。エラーが
発生したので確認してください。」）。語尾変換ルールは正規表現の`$`（文字列の
末尾）に対して書いているため、分割せずに1つの文字列として渡すと、最後の文
にしか語尾変換がかからない。文ごとに分割してから語尾変換をかけることで、
すべての文の語尾を変換できるようにする。
"""

from __future__ import annotations

import re

# 文末記号の直後で区切る。区切り文字（。！？）は前の文に残す（re.split の
# 先読みではなく `(?<=...)` の後読みを使っているのはこのため）。
_SENTENCE_BOUNDARY = re.compile(r"(?<=[。！？!?])")


def split_sentences(text: str) -> list[str]:
    """`text`を文単位に分割する。空の要素は含めない。"""
    return [sentence for sentence in _SENTENCE_BOUNDARY.split(text) if sentence]


if __name__ == "__main__":
    sample = "今日は疲れました。エラーが発生したので確認してください。"
    print(f"入力: {sample}")
    print(f"分割結果: {split_sentences(sample)}")
