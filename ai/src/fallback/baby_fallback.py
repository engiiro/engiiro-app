"""赤ちゃん語のルールベース変換（フォールバック経路）。

docs/ai_transform_design.md 6.3〜6.6章の実装。

処理の流れ：
  1. 辞書（カテゴリ辞書・エンジニア用語辞書）を最長一致で置換する（辞書マッチには
     形態素解析を使わない。理由は dictionary_match.py の docstring を参照）
  2. 文末表現を赤ちゃん語の語尾へ書き換える
  3. 一人称を書き換える
  4. 気持ちワード（「疲れた」等）を含む文には、文頭へ感嘆詞を1つ添える

気持ちワードの検出だけは形態素解析（fugashi）を使う。「疲れた」「疲れました」
「疲れちゃった」のように活用形が変わっても、原形（lemma）で見れば同じ語として
扱えるため、正規表現の羅列より頑健である。
"""

from __future__ import annotations

import re

import fugashi

from src.fallback.dictionary_loader import load_variant_dictionary
from src.fallback.dictionary_match import replace_longest_match
from src.fallback.sentence_split import split_sentences

# Taggerの初期化はコストがあるため、モジュール読み込み時に1回だけ行う。
_tagger = fugashi.Tagger()

# 辞書もモジュール読み込み時に1回だけ読み込む（リクエストのたびにJSONを
# 読み直さないため）。ai/dictionaries/*.json を参照。
_DAILY_WORDS = load_variant_dictionary("baby_daily_words.json")
_ENGINEER_WORDS = load_variant_dictionary("baby_engineer_words.json")

# 気持ちワードの原形一覧。活用形（疲れた／疲れます／疲れちゃった）を問わず、
# 原形がここに含まれていれば「弱音」を含む文と判定する。
_FEELING_LEMMAS = {"疲れる", "つらい", "辛い", "無理", "大変", "難しい", "眠い"}

# 文末を赤ちゃん語の語尾へ置き換える。正規表現は先に書いたものから順に試し、
# 最初に一致したものだけを適用する（「でした」は「です」より先に判定しないと、
# 「でした」の「した」部分だけ「です」ルールに誤って一致してしまう）。
_ENDING_RULES: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"してください[。.]?$"), "してほしいのー。"),
    (re.compile(r"ください[。.]?$"), "ほしいのー。"),
    (re.compile(r"でした[。.]?$"), "だったのー。"),
    (re.compile(r"ました[。.]?$"), "たのー。"),
    (re.compile(r"します[。.]?$"), "するのー。"),
    (re.compile(r"です[。.]?$"), "でちゅ。"),
    (re.compile(r"ます[。.]?$"), "まちゅ。"),
    (re.compile(r"だ[。.]?$"), "なの。"),
)

_ALREADY_BABY_ENDING = re.compile(r"[。.！!?？のちゅーぉ]$")

_FIRST_PERSON_WORDS: dict[str, str] = {
    "私": "わたち",
    "僕": "ぼく",
    "俺": "ぼく",
    "自分": "ぼく",
}

# 感嘆詞は2種類だけを使い、外部の乱数には頼らない。文字数の偶奇という
# 入力から一意に決まる値で選ぶことで、同じ入力には常に同じ出力を返す
# （テストのしやすさと、利用者から見た挙動の一貫性のため）。
_FEELING_PREFIXES = ("ばぶー、", "おぎゃー、")


def _has_feeling_word(text: str) -> bool:
    return any(word.feature.lemma in _FEELING_LEMMAS for word in _tagger(text))


def _apply_ending_rule(text: str) -> str:
    for pattern, replacement in _ENDING_RULES:
        if pattern.search(text):
            return pattern.sub(replacement, text)
    if _ALREADY_BABY_ENDING.search(text):
        return text
    return text + "でちゅ"


def _replace_first_person(text: str) -> str:
    for word, replacement in _FIRST_PERSON_WORDS.items():
        text = text.replace(word, replacement)
    return text


def to_baby_words(text: str) -> str:
    """文章を赤ちゃん語へ変換する。Gemini APIを使わない、規則だけの変換。"""
    has_feeling = _has_feeling_word(text)

    result = replace_longest_match(text, _DAILY_WORDS)
    result = replace_longest_match(result, _ENGINEER_WORDS)

    # 語尾変換は文字列の末尾（正規表現の `$`）にしかかからないため、複数文
    # からなる入力では文ごとに分けてから適用する（最初の文だけ変換されず
    # 残ってしまう不具合を避けるため）。
    result = "".join(_apply_ending_rule(sentence) for sentence in split_sentences(result))
    result = _replace_first_person(result)

    if has_feeling:
        prefix = _FEELING_PREFIXES[len(text) % len(_FEELING_PREFIXES)]
        result = prefix + result

    return result


if __name__ == "__main__":
    samples = [
        "今日は疲れました。",
        "エラーが発生したので、確認してください。",
        "私はセダンで通勤し、途中で救急車を見た。",
        "お昼はカツカレーを食べた。",
        "お約束を破ってしまいました。",
    ]
    for sample in samples:
        print(f"入力: {sample}")
        print(f"出力: {to_baby_words(sample)}")
        print()
