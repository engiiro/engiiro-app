"""`ai/dictionaries/`配下のJSON辞書を読み込み、置換辞書の形へ変換する。

辞書ファイルには2つの形がある。

1. **フラット辞書**：`{語: 置換後の語}`（1対1）。`harsh_word_softeners.json`など。
2. **バリエーション辞書**：`{サブカテゴリ: {大人の言葉: [赤ちゃん語の候補, ...]}}`
   （2階層、大人の言葉1つに対して赤ちゃん語の候補が複数ありうる）。
   `baby_daily_words.json`・`baby_engineer_words.json`など。トップレベルの
   サブカテゴリはファイルを人間が読みやすくするためのグルーピングであり、
   変換ロジックからは見えない（読み込み時にフラット化する）。

候補が複数ある場合は、対象の単語自体の文字数から機械的に1つを選ぶ。同じ単語
には常に同じ変換結果を返すため（外部の乱数には頼らない。理由は
baby_fallback.pyの感嘆詞選択と同じ）。

どちらの形でも`_comment`キーで辞書の説明を書けるようにしている（JSON自体には
コメント構文が無いため）。読み込み時に`_`で始まるキーは辞書の対象から除く。

大量の語彙を人間やAIが追記していく前提のため、Pythonの辞書リテラルではなく
JSONにしている（構文エラーを起こしにくく、差分レビューもしやすい）。

**訛り変換とのエイリアス自動登録**：`baby_fallback.py`は辞書変換より前に
`toddler_accent.apply_toddler_accent()`を入力文全体へ適用する（例：
「うさぎ」→「うしゃぎ」）。そのため、辞書のキーが「うさぎ」のままだと、
訛った後の文字列「うしゃぎ」とは一致しなくなってしまう。`load_variant_dictionary()`
はこれを避けるため、各キーに`apply_toddler_accent()`を適用した結果が元の
キーと異なる場合、その訛った形も同じ値で追加登録する。辞書ファイル自体に
「うしゃぎ」のようなキーを手で書き足す必要は無い。
"""

from __future__ import annotations

import json
from pathlib import Path

from src.fallback.toddler_accent import apply_toddler_accent

DICTIONARIES_DIR = Path(__file__).resolve().parent.parent.parent / "dictionaries"


def _load_json(filename: str) -> dict[str, object]:
    path = DICTIONARIES_DIR / filename
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def _pick_variant(word: str, candidates: list[str]) -> str:
    return candidates[len(word) % len(candidates)]


def load_flat_dictionary(filename: str) -> dict[str, str]:
    """フラット辞書（`{語: 置換後の語}`）を読み込む。`_comment`等は除く。"""
    data = _load_json(filename)
    return {key: value for key, value in data.items() if not key.startswith("_")}


def load_variant_dictionary(filename: str) -> dict[str, str]:
    """バリエーション辞書を読み込み、`replace_longest_match()`にそのまま渡せる
    `{大人の言葉: 赤ちゃん語}`のフラットな置換辞書へ変換する。

    トップレベルがサブカテゴリの2階層形式（`{サブカテゴリ: {語: [候補,...]}}`）
    と、サブカテゴリの無いフラットな1階層形式（`{語: [候補,...]}`）の両方を
    受け付ける。
    """
    data = _load_json(filename)
    flattened: dict[str, str] = {}
    for key, value in data.items():
        if key.startswith("_"):
            continue
        if isinstance(value, dict):
            # 2階層形式：value がサブカテゴリの中身（{語: [候補,...]}）
            for word, candidates in value.items():
                if word.startswith("_"):
                    continue
                flattened[word] = _pick_variant(word, candidates)
        else:
            # 1階層形式：value がそのまま候補のリスト
            flattened[key] = _pick_variant(key, value)

    # 訛り変換で元のキーと異なる文字列になるものは、その訛った形も同じ値で
    # 追加登録する（辞書ファイル自体は変更しない）。既存キーと衝突する場合は
    # 上書きしない（意図しない語の変換結果を壊さないため）。
    accented_aliases: dict[str, str] = {}
    for word, replacement in flattened.items():
        accented_word = apply_toddler_accent(word)
        if accented_word != word and accented_word not in flattened:
            accented_aliases[accented_word] = replacement
    flattened.update(accented_aliases)

    return flattened


if __name__ == "__main__":
    daily_words = load_variant_dictionary("baby_daily_words.json")
    print(f"日常語彙辞書の語数: {len(daily_words)}")
    print(f"例: 'ママ' -> {daily_words.get('ママ')!r}")
    print(f"例: '救急車' -> {daily_words.get('救急車')!r}")

    engineer_words = load_variant_dictionary("baby_engineer_words.json")
    print(f"エンジニア用語辞書の語数: {len(engineer_words)}")
    print(f"例: 'エラー' -> {engineer_words.get('エラー')!r}")

    flat_dictionary = load_flat_dictionary("harsh_word_softeners.json")
    print(f"フラット辞書の語数: {len(flat_dictionary)}")
    print(f"例: '無能' -> {flat_dictionary.get('無能')!r}")
