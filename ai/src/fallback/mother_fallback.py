"""お母さん語のルールベース変換（フォールバック経路）。

docs/ai_transform_design.md 6.7章の実装。

赤ちゃん語（baby_fallback.py）と違い、単語単位の置換辞書は持たない。
お母さん語らしさは「断定・命令をやわらげる語尾」と「労いの前置き・後置き」で
表現する。絵文字・顔文字は付けない（1.2章：文体を採点基準で縛らない、という
人間監督の判断に合わせている）。
"""

from __future__ import annotations

import re

from src.fallback.sentence_split import split_sentences

_ENDING_RULES: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"してください[。.]?$"), "してもらえるかな。"),
    (re.compile(r"しろ[。.]?$"), "してもらえるかな。"),
    (re.compile(r"して[。.]?$"), "してもらえるかな。"),
    (re.compile(r"でした[。.]?$"), "だったんだね。"),
    (re.compile(r"ました[。.]?$"), "たんだね。"),
    (re.compile(r"です[。.]?$"), "なんだね。"),
    (re.compile(r"ます[。.]?$"), "るのね。"),
    (re.compile(r"だ[。.]?$"), "だね。"),
)

# 前置き・後置きは、外部の乱数ではなく文字数から機械的に選ぶ。
# 同じ入力に対して常に同じ出力になるようにするため（テストのしやすさと、
# 利用者から見た挙動の一貫性のため）。
_PREFIXES = ("そうだったのね、", "よしよし、", "だいじょうぶだよ、")
_SUFFIXES = ("よく頑張ったね。", "無理しないでね。", "えらいよ。")


def _apply_ending_rule(text: str) -> str:
    for pattern, replacement in _ENDING_RULES:
        if pattern.search(text):
            return pattern.sub(replacement, text)
    return text


def to_mother_words(text: str) -> str:
    """文章をお母さん語へ変換する。Gemini APIを使わない、規則だけの変換。"""
    # 語尾変換は文字列の末尾（正規表現の `$`）にしかかからないため、複数文
    # からなる入力では文ごとに分けてから適用する（baby_fallback.py と同じ理由）。
    body = "".join(_apply_ending_rule(sentence) for sentence in split_sentences(text))
    prefix = _PREFIXES[len(text) % len(_PREFIXES)]
    suffix = _SUFFIXES[len(text) % len(_SUFFIXES)]
    return f"{prefix}{body} {suffix}"


if __name__ == "__main__":
    samples = [
        "今日は疲れました。",
        "エラーが発生したので、確認してください。",
        "資料を作らないといけない。",
        "レビューで指摘された。",
    ]
    for sample in samples:
        print(f"入力: {sample}")
        print(f"出力: {to_mother_words(sample)}")
        print()
