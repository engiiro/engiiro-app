"""`ai/dictionaries/`配下のJSON辞書を読み込み、置換辞書の形へ変換する。

辞書ファイルには2つの形がある。

1. **フラット辞書**：`{語: 置換後の語}`（1対1）。`harsh_word_softeners.json`など。
2. **カテゴリ辞書**：`{赤ちゃん語: [対応する単語の一覧]}`（多対1）。
   `baby_category_words.json`・`baby_engineer_words.json`など。

どちらも`_comment`キーで辞書の説明を書けるようにしている（JSON自体には
コメント構文が無いため）。読み込み時に`_`で始まるキーは辞書の対象から除く。

大量の語彙を人間やAIが追記していく前提のため、Pythonの辞書リテラルではなく
JSONにしている（構文エラーを起こしにくく、差分レビューもしやすい）。
"""

from __future__ import annotations

import json
from pathlib import Path

DICTIONARIES_DIR = Path(__file__).resolve().parent.parent.parent / "dictionaries"


def _load_json(filename: str) -> dict[str, object]:
    path = DICTIONARIES_DIR / filename
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def load_flat_dictionary(filename: str) -> dict[str, str]:
    """フラット辞書（`{語: 置換後の語}`）を読み込む。`_comment`等は除く。"""
    data = _load_json(filename)
    return {key: value for key, value in data.items() if not key.startswith("_")}


def load_category_dictionary(filename: str) -> dict[str, str]:
    """カテゴリ辞書（`{赤ちゃん語: [対応語の一覧]}`）を読み込み、
    `replace_longest_match()`にそのまま渡せる `{対応語: 赤ちゃん語}` の
    フラットな置換辞書へ変換する。
    """
    data = _load_json(filename)
    flattened: dict[str, str] = {}
    for category, words in data.items():
        if category.startswith("_"):
            continue
        for word in words:
            flattened[word] = category
    return flattened


if __name__ == "__main__":
    category_dictionary = load_category_dictionary("baby_category_words.json")
    print(f"カテゴリ辞書の語数: {len(category_dictionary)}")
    print(f"例: 'カツカレー' -> {category_dictionary.get('カツカレー')!r}")
    print(f"例: '救急車' -> {category_dictionary.get('救急車')!r}")

    flat_dictionary = load_flat_dictionary("harsh_word_softeners.json")
    print(f"フラット辞書の語数: {len(flat_dictionary)}")
    print(f"例: '無能' -> {flat_dictionary.get('無能')!r}")
