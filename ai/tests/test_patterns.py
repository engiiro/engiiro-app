"""パターン集を一括で流す回帰テスト。

パターンを増やすときは tests/patterns.py に足す。
ALLOW 側（弾いてはいけないもの）を厚くするのが基本。
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import patterns as P
from moderation_rules import check_rules, tokenizer_available


def _label(text):
    return text if len(text) <= 30 else text[:28] + "…"


@pytest.mark.parametrize("text", P.ALLOW, ids=_label)
def test_弾いてはいけないものを弾かない(text):
    result = check_rules(text)
    assert result["action"] == "allow", result["details"]


@pytest.mark.parametrize("text", P.BLOCK, ids=_label)
def test_弾くべきものを弾く(text):
    assert check_rules(text)["action"] == "block"


@pytest.mark.parametrize("text", P.REWRITE, ids=_label)
def test_マサカリ語をrewrite_requiredにする(text):
    result = check_rules(text)
    if not tokenizer_available() and result["action"] == "allow":
        pytest.skip("形態素解析器が無いので品詞つきの語は調べない")
    assert result["action"] == "rewrite_required", result["details"]


@pytest.mark.parametrize("text", P.SELF_HARM, ids=_label)
def test_自傷表現を検出する(text):
    assert "self_harm" in check_rules(text)["reasonCodes"]


@pytest.mark.parametrize("text,expected,reason", P.KNOWN_GAPS,
                         ids=lambda v: _label(v) if isinstance(v, str) else "")
def test_規則の外にあるものを記録として残す(text, expected, reason):
    """まだ拾えていないものを、実際の判定つきで記録しておく。

    改善して判定が変わったらこのテストが落ちる。
    落ちたら KNOWN_GAPS から通常のパターンへ移すこと。
    """
    assert check_rules(text)["action"] == expected, reason
