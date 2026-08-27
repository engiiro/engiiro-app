"""赤ちゃん語のルールベース変換（フォールバック経路）。

docs/ai_transform_design.md 6.3〜6.6章の実装。

処理の流れ：
  1. 辞書（カテゴリ辞書・エンジニア用語辞書）を最長一致で置換する（辞書マッチには
     形態素解析を使わない。理由は dictionary_match.py の docstring を参照）
  2. 部品辞書（例：「仕様」＋「書」）を、名詞・接尾辞のトークン単位で置換する
     （token_match.py の docstring を参照。辞書に無い新しい複合語にも対応するため）
  3. 文末表現を赤ちゃん語の語尾へ書き換える
  4. 一人称を書き換える
  5. 気持ちワード（「疲れた」等）を含む文には、文頭へ感嘆詞を1つ添える

  1を2より先に行う理由：「基本設計書」のように複合語辞書へそのまま残した
  長い複合語（8文字）を、部品辞書の短いキー「書」（1文字）より先に確実に
  マッチさせるため。1で使い切った文字列には、もう部品辞書のキーとなる
  文字は残らないため、2で二重に変換される心配もない。

  逆に部品辞書へ入れる語（「仕様」「フロー」「書」「図」等）は、日常語彙
  辞書・エンジニア複合語辞書のどのキーとも文字列として重ならないものだけを
  選んでいる（例：「手」（体の部位、1文字）と衝突する「手順」は部品化せず、
  「手順書」のまま複合語辞書に残している。判断基準は
  baby_engineer_word_parts.json のコメントを参照）。

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
from src.fallback.token_match import replace_by_token

# Taggerの初期化はコストがあるため、モジュール読み込み時に1回だけ行う。
_tagger = fugashi.Tagger()

# 辞書もモジュール読み込み時に1回だけ読み込む（リクエストのたびにJSONを
# 読み直さないため）。ai/dictionaries/*.json を参照。
#
# 日常語彙とエンジニア用語は1つの辞書へ統合してから replace_longest_match()
# へ渡す。理由：別々に replace_longest_match() を呼ぶと、片方の辞書の短い
# キーがもう片方の辞書の複合語の一部を先に食べてしまうことがある
# （例：「手順書」を処理する前に「手」（日常語彙・体の部位）が先にマッチし、
# 「手順」というキーを認識できなくなる）。1つの辞書に統合して一度に最長一致
# させれば、キーの長さだけで正しく優先順位が決まる（「手順書」3文字 >
# 「手」1文字）。両辞書にキーの重複が無いことは
# tests/test_fallback_transform.py で確認している。
_DAILY_WORDS = load_variant_dictionary("baby_daily_words.json")
_ENGINEER_WORDS = load_variant_dictionary("baby_engineer_words.json")
_COMPLEX_WORDS = {**_DAILY_WORDS, **_ENGINEER_WORDS}
_ENGINEER_WORD_PARTS = load_variant_dictionary("baby_engineer_word_parts.json")

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

    result = replace_longest_match(text, _COMPLEX_WORDS)
    result = replace_by_token(result, _ENGINEER_WORD_PARTS)

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
