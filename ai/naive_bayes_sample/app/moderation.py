"""分類器向けの決定的モデレーションアダプター。"""

from __future__ import annotations

import sys
from pathlib import Path

_AI_ROOT = Path(__file__).resolve().parents[2]
if str(_AI_ROOT) not in sys.path:
    sys.path.insert(0, str(_AI_ROOT))

from moderation_rules import check_rules, normalize_for_check  # noqa: E402


def normalize_for_moderation(text: str) -> str:
    """ひらがな・カタカナ・伏字・空白を統一した判定用文字列を返す。"""
    return normalize_for_check(text)


def find_abuse(text: str) -> tuple[str, ...]:
    """登録済みのブロック／強い批判表現を返す。"""
    verdict = check_rules(text)
    if verdict["action"] not in {"block", "rewrite_required"}:
        return ()
    return tuple(verdict["details"]["ng_word"] + verdict["details"]["harsh_criticism"])


def is_abusive(text: str) -> bool:
    """登録済みの明示的な攻撃表現を含むか判定する。"""
    return bool(find_abuse(text))
