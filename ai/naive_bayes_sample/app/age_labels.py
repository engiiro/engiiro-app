"""年齢推定用ラベルを分類ラベルと分離して扱うための契約。"""

from __future__ import annotations

import json
from pathlib import Path


def load_age_labels(path: Path) -> list[dict]:
    """年齢ラベル付きJSONを読み込む。分類学習データとは別ファイルを要求する。"""
    with path.open(encoding="utf-8") as handle:
        rows = json.load(handle)
    if not isinstance(rows, list):
        raise ValueError("年齢ラベルはオブジェクト配列で指定してください")
    for index, row in enumerate(rows):
        if not isinstance(row, dict) or not isinstance(row.get("text"), str):
            raise ValueError(f"{index}行目に text がありません")
        age = row.get("age")
        if not isinstance(age, (int, float)) or not 0 <= age <= 6:
            raise ValueError(f"{index}行目の age は0〜6の数値が必要です")
        if "label" in row:
            raise ValueError("年齢ラベルファイルへ分類ラベルを混在させないでください")
    return rows
