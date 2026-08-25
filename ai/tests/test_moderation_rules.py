"""moderation_rules の判定を確かめる。

一番大事なのは「誤検出しないこと」。えんじいろの利用者はエンジニアなので、
技術用語や日常語が弾かれるとサービスとして使えなくなる（Issue #11）。
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from moderation_rules import check_rules, find_personal_data, normalize_for_check


# ============================================================
# 伏字回避の正規化
# ============================================================

def test_伏字を挟んでも同じ文字列になる():
    for masked in ["し ね", "し○ね", "し*ね", "し・ね", "し。ね", "し​ね", "ｼﾈ", "シ ネ"]:
        assert normalize_for_check(masked) == "しね", masked


def test_引き延ばしをたたむ():
    assert normalize_for_check("しねええええ") == "しねええ"[:3] + "え"


def test_濁点を落とさない():
    # 落とすと「ダメ」が「ため」になり、日常語と衝突する
    assert normalize_for_check("ﾀﾞﾒ") == "だめ"
    assert normalize_for_check("バカ") == "ばか"


# ============================================================
# 技術用語の誤検出（Issue #11）
# ============================================================

TECH_SAMPLES = [
    "React.js つらい",
    "index.ts が壊れた",
    "Node.js のバージョンで詰んだ",
    "package.json を直した",
    "tsconfig.json が読めない",
    "main.py を実行した",
    "style.css が効かない",
    "next.js 難しい",
    "socket.io がつながらない",
    "v2 にした",
    "app.py と test_app.py を分けた",
]


def test_技術用語をURLと誤判定しない():
    for sample in TECH_SAMPLES:
        result = check_rules(sample)
        assert result["action"] == "allow", (sample, result)


# ============================================================
# 日常語の誤検出
# ============================================================

INNOCENT_SAMPLES = [
    "スケジュールをはかることにした。",       # 「ばか」と衝突しないこと
    "計画ばかり増えていく。",                 # 「ばか」
    "設計がくずれてしまった。",               # 「くず」
    "資料を貸すことになった。",               # 「かす」
    "申し込みが多くて混んでいる。",           # 「ごみ」
    "薬を飲んで寝た。",                       # 「くす」
    "ダメ出しをたくさんもらった。",           # 「だめ」
    "池沼の生態系について調べた。",           # 同綴りの一般語
    "今日はチームで仕様書をレビューした。",
    "テストが全部落ちていて、原因が分からない。つらい。",
]


def test_日常語を弾かない():
    for sample in INNOCENT_SAMPLES:
        result = check_rules(sample)
        assert result["action"] == "allow", (sample, result)


# ============================================================
# 検出できること
# ============================================================

def test_NG語をblockする():
    for sample in ["死ね", "し ね", "し○ね", "ｼﾈ", "消えろ"]:
        result = check_rules(sample)
        assert result["action"] == "block", (sample, result)
        assert "ng_word" in result["reasonCodes"]


def test_マサカリ語をblockにする():
    """人間監督の決定により、状況によらず block。

    「マサカリは完全にブロックにしましょう。状況によって変えません」
    以前は rewrite_required だった。理由コードは harsh_criticism のまま。
    """
    result = check_rules("あの人は無能だと思う。")
    assert result["action"] == "block"
    assert "harsh_criticism" in result["reasonCodes"]


def test_自傷表現を検出する():
    result = check_rules("もう消えたい。")
    assert "self_harm" in result["reasonCodes"]


def test_弱音は自傷と区別する():
    # 「つらい」「しんどい」は self_harm ではない
    result = check_rules("しんどい。つらい。もう限界かもしれない。")
    assert "self_harm" not in result["reasonCodes"]
    assert result["action"] == "allow"


# ============================================================
# 個人情報
# ============================================================

def test_個人情報を検出する():
    assert "phone" in find_personal_data("連絡は 090-1234-5678 まで")
    assert "email" in find_personal_data("osato@example.com へ送って")
    assert "url" in find_personal_data("https://example.com を見て")
    assert "url" in find_personal_data("example.com を見て")
    assert "postal_code" in find_personal_data("123-4567 に住んでいる")
    assert "account_id" in find_personal_data("@osato_rin で探して")


def test_個人情報はblockする():
    result = check_rules("連絡ください。090-1234-5678 です。")
    assert result["action"] == "block"
    assert "personal_data" in result["reasonCodes"]


def test_技術用語は個人情報にしない():
    for sample in TECH_SAMPLES:
        assert find_personal_data(sample) == [], sample
