"""文章から0.0〜6.0歳の目安を返す、決定的な評価ベースライン。

このモジュールは学習済みモデルではない。外部通信を行わず、次の表層的な特徴を
組み合わせる説明可能なルールベースである。

* baby: 本文自体の幼さ（幼児語、幼い語尾、かな・漢字の構成）
* mother: 本文が想定する相手の年齢（乳幼児向けの呼びかけ、成人向けの敬語）

製品名、ファイル名、バージョン番号などのASCII英数字は、かな・漢字の構成比を
計算するときに除外する。したがって React.js や index.ts が含まれるだけで
推定年齢が極端に変わることはない。

限界: 文脈、皮肉、方言、話者ごとの個人差、明示されていない宛先は推定できない。
値は医学的な年齢判定ではなく、文章同士を比較するための暫定的な目安である。
本番の保存可否を決める閾値は、このモジュールでは扱わない。
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable


MIN_AGE = 0.0
MAX_AGE = 6.0

# 同じ語を繰り返しても点数を増減させないため、各特徴は有無だけを見る。
_BABY_YOUNG_CUES = (
    ("まんま", -0.9),
    ("ねんね", -0.9),
    ("ばぶ", -1.0),
    ("おぎゃ", -1.0),
    ("あんよ", -0.6),
    ("おてて", -0.6),
    ("ぶーぶー", -0.6),
    ("わんわん", -0.4),
    ("にゃんにゃん", -0.4),
    ("だっこ", -0.3),
)

_MOTHER_YOUNG_TARGET_CUES = (
    ("よしよし", -1.1),
    ("できたね", -0.9),
    ("えらいね", -0.8),
    ("いいこ", -0.7),
    ("ねんね", -0.8),
    ("まんま", -0.8),
    ("おてて", -0.7),
    ("あんよ", -0.7),
    ("だっこ", -0.6),
    ("ぽんぽん", -0.5),
)

_MOTHER_OLDER_TARGET_CUES = (
    ("お疲れさま", 0.8),
    ("お疲れ様", 0.8),
    ("ご対応", 0.6),
    ("ご確認", 0.6),
    ("ご検討", 0.6),
    ("ありがとうございます", 0.8),
    ("無理なさら", 0.7),
    ("ご自愛", 0.8),
)

_BABY_ENDING_PATTERNS = (
    (re.compile(r"(?:でちゅ|でしゅ)(?=[。！？!?…]+|$)"), -0.8),
    (re.compile(r"(?:だもん|なの|のー|よー)(?=[。！？!?…]+|$)"), -0.6),
    (re.compile(r"ちゃった(?=[。！？!?…]+|$)"), -0.3),
)

_BABY_FORMAL_ENDING = re.compile(
    r"(?:です|ます|でした|ました|ません)(?=[。！？!?…]+|$)"
)
_MOTHER_FORMAL_ENDING = re.compile(
    r"(?:ください|ございます|いたします|なさって)(?=[。！？!?…]+|$)"
)
_MOTHER_CHILD_DIRECTED_ENDING = re.compile(
    r"(?:しようね|できるかな|しようか|だよ)(?=[。！？!?…]+|$)"
)

# 日本語の隣に続く助詞は残し、ASCIIで書かれた技術断片だけを除く。
_TECHNICAL_FRAGMENT_PATTERN = re.compile(
    r"(?<![A-Za-z0-9_])[A-Za-z0-9_]+(?:[./:+-][A-Za-z0-9_]+)*"
)

# 話題を変えても、同じ日本語の文体なら評価値を変えない。
_TECHNICAL_JAPANESE_TERMS = (
    "仕様書", "レビュー", "実装", "設計", "検証", "要件", "業務",
    "原因", "対応", "報告", "資料",
)

# 判定用コピーから不可視の format 文字を除く。原文を変更する用途には使わない。
def _normalize_for_evaluation(text: str) -> str:
    """NFKC と不可視文字除去を適用した判定用コピーを返す。"""
    normalized = unicodedata.normalize("NFKC", text)
    return "".join(
        character for character in normalized if unicodedata.category(character) != "Cf"
    )


def evaluate(body: str, persona_type: str) -> float:
    """本文を評価し、0.0〜6.0歳の範囲で小数1桁の目安を返す。

    baby と mother は値の範囲だけを共有し、意味と計算方法は共有しない。
    baby は本文自体の幼さ、mother は本文が向けられた相手の年齢を表す。

    Raises:
        TypeError: body が文字列でない場合。
        ValueError: 本文が空、または persona_type が未対応の場合。
    """

    if not isinstance(body, str):
        raise TypeError("body must be a string")

    text = _normalize_for_evaluation(body).strip()
    if not text:
        raise ValueError("body must not be blank")
    if persona_type not in {"baby", "mother"}:
        raise ValueError("persona_type must be 'baby' or 'mother'")

    if persona_type == "baby":
        return _evaluate_baby_text(text)
    return _evaluate_mother_target(text)


def _evaluate_baby_text(text: str) -> float:
    """本文そのものの幼さを表層的な特徴から評価する。"""

    age = 4.1
    age += _bounded_cue_adjustment(text, _BABY_YOUNG_CUES, -2.8, 0.0)

    for pattern, adjustment in _BABY_ENDING_PATTERNS:
        if pattern.search(text):
            age += adjustment
            break

    if _BABY_FORMAL_ENDING.search(text):
        age += 0.5

    hiragana, katakana, kanji = _japanese_script_counts(text)
    japanese_characters = hiragana + katakana + kanji
    if japanese_characters >= 4:
        hiragana_ratio = hiragana / japanese_characters
        kanji_ratio = kanji / japanese_characters

        if hiragana_ratio >= 0.85 and kanji == 0:
            age -= 0.5
        elif kanji_ratio >= 0.20:
            age += 0.4

        # 長さだけを強い根拠にはせず、複文になりやすい長文へ小さく加点する。
        if japanese_characters >= 20:
            age += 0.2

    return _rounded_age(age)


def _evaluate_mother_target(text: str) -> float:
    """お母さん口調の上手さではなく、その文章が想定する相手の年齢を評価する。"""

    age = 3.6
    age += _bounded_cue_adjustment(
        text, _MOTHER_YOUNG_TARGET_CUES, minimum=-2.8, maximum=0.0
    )
    age += _bounded_cue_adjustment(
        text, _MOTHER_OLDER_TARGET_CUES, minimum=0.0, maximum=2.0
    )

    if _MOTHER_FORMAL_ENDING.search(text):
        age += 0.4
    elif _MOTHER_CHILD_DIRECTED_ENDING.search(text):
        age -= 0.3

    return _rounded_age(age)


def _bounded_cue_adjustment(
    text: str,
    cues: Iterable[tuple[str, float]],
    minimum: float,
    maximum: float,
) -> float:
    """存在する語の重みを合計し、単語の詰め込みによる極端な値を防ぐ。"""

    adjustment = sum(weight for cue, weight in cues if cue in text)
    return min(max(adjustment, minimum), maximum)


def _japanese_script_counts(text: str) -> tuple[int, int, int]:
    """技術断片を除いた本文の、ひらがな・カタカナ・漢字数を返す。"""

    linguistic_text = _TECHNICAL_FRAGMENT_PATTERN.sub("", text)
    for term in _TECHNICAL_JAPANESE_TERMS:
        linguistic_text = linguistic_text.replace(term, "")
    hiragana = sum("ぁ" <= character <= "ゖ" for character in linguistic_text)
    katakana = sum("ァ" <= character <= "ヺ" for character in linguistic_text)
    kanji = sum(
        "㐀" <= character <= "䶿" or "一" <= character <= "鿿"
        for character in linguistic_text
    )
    return hiragana, katakana, kanji


def _rounded_age(age: float) -> float:
    """公開範囲へ収め、常にfloatの小数1桁へ丸める。"""

    clamped_age = min(max(age, MIN_AGE), MAX_AGE)
    return float(round(clamped_age, 1))
