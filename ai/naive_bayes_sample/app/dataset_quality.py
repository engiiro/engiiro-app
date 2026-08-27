"""学習・固定評価データの重複検査と差し替え支援。"""

from __future__ import annotations

import json
import re
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path
from typing import Iterable

LABELS = ("赤ちゃん", "お母さん", "その他")
_SPACE = re.compile(r"\s+")
_PUNCTUATION = re.compile(r"[。、，！？!?・「」『』（）()\[\]{}【】…~〜ー]+")


def normalize_for_duplicate(text: str) -> str:
    """ゼロ幅文字・空白・表記揺れを除いた重複検査用文字列を返す。"""
    normalized = unicodedata.normalize("NFKC", text).casefold()
    normalized = "".join(
        char for char in normalized if unicodedata.category(char) != "Cf"
    )
    normalized = _SPACE.sub("", normalized)
    return _PUNCTUATION.sub("", normalized)


def duplicate_pairs(records: Iterable[dict], *, near_threshold: float | None = None) -> list[tuple[int, int]]:
    """完全一致・正規化一致、または任意の近似一致の行番号ペアを返す。"""
    rows = list(records)
    normalized = [normalize_for_duplicate(str(row.get("text", ""))) for row in rows]
    pairs: list[tuple[int, int]] = []
    for left in range(len(rows)):
        for right in range(left + 1, len(rows)):
            if normalized[left] and normalized[left] == normalized[right]:
                pairs.append((left, right))
            elif near_threshold is not None and normalized[left] and normalized[right]:
                score = SequenceMatcher(None, normalized[left], normalized[right]).ratio()
                if score >= near_threshold:
                    pairs.append((left, right))
    return pairs


def validate_fixed_test_set(records: Iterable[dict]) -> None:
    """固定テストセットが全ラベルを含み、重複していないことを検証する。"""
    rows = list(records)
    labels = {row.get("label") for row in rows}
    missing = set(LABELS) - labels
    if missing:
        raise ValueError(f"固定テストセットにラベルがありません: {sorted(missing)}")
    duplicates = duplicate_pairs(rows)
    if duplicates:
        raise ValueError(f"固定テストセットに重複があります: {duplicates}")


def load_fixed_test_set(path: Path) -> list[dict]:
    """JSON形式の固定テストセットを読み、契約を検証する。"""
    with path.open(encoding="utf-8") as handle:
        records = json.load(handle)
    if not isinstance(records, list) or not all(isinstance(row, dict) for row in records):
        raise ValueError("固定テストセットはオブジェクト配列で指定してください")
    validate_fixed_test_set(records)
    return records


def apply_replacements(records: Iterable[dict], replacements: dict[int, str]) -> list[dict]:
    """指定行だけを差し替え、差し替え後の重複を再検査する。

    文章そのものは人間または別工程が用意する。空文字の差し替えや、
    重複を残したままの確定は許可しない。
    """
    updated = [dict(row) for row in records]
    for index, text in replacements.items():
        if index < 0 or index >= len(updated) or not isinstance(text, str) or not text.strip():
            raise ValueError(f"差し替え行または文章が不正です: {index}")
        updated[index]["text"] = text
    duplicates = duplicate_pairs(updated)
    if duplicates:
        raise ValueError(f"差し替え後も重複が残っています: {duplicates}")
    return updated
