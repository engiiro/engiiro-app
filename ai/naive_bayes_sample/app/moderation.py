"""明示的な攻撃表現を分類前に遮断する決定的モデレーション。"""

from __future__ import annotations

import re
import unicodedata

# 学習データだけでは未知の罵倒を保証できないため、明示的な攻撃表現は
# 確率計算より先に「その他」へ固定する。語彙はレビュー可能な最小辞書とし、
# 新しい表現はこの一覧へ追加する。
ABUSE_PATTERNS: tuple[str, ...] = (
    "死ね",
    "消えろ",
    "殺す",
    "殺してやる",
    "死んでほしい",
    "くたばれ",
    "黙れ",
    "うせろ",
    "失せろ",
    "無能",
    "役立たず",
    "能無し",
    "ゴミ",
    "クズ",
    "屑",
    "カス",
    "馬鹿",
    "バカ",
    "アホ",
    "間抜け",
    "キモい",
    "きもい",
    "キモイ",
    "うざい",
    "頭おかしい",
    "頭悪い",
    "低能",
)

_SPACE = re.compile(r"\s+")


def normalize_for_moderation(text: str) -> str:
    """NFKC・小文字化・ゼロ幅文字と空白の除去を行う。"""
    normalized = unicodedata.normalize("NFKC", text).casefold()
    normalized = "".join(
        char for char in normalized if unicodedata.category(char) != "Cf"
    )
    return _SPACE.sub("", normalized)


def find_abuse(text: str) -> tuple[str, ...]:
    """入力に含まれる登録済み攻撃表現を返す（未検出なら空 tuple）。"""
    normalized = normalize_for_moderation(text)
    return tuple(pattern for pattern in ABUSE_PATTERNS if pattern.casefold() in normalized)


def is_abusive(text: str) -> bool:
    """登録済みの明示的な攻撃表現を含むか判定する。"""
    return bool(find_abuse(text))
