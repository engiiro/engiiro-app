"""辞書の候補集め（dictionaries/harvest.py）を確かめる。

手元のLLMは呼ばない。差し替えて、**安全装置が効くか**だけを見る。

このツールの怖いところは、LLMが挙げた語をそのまま辞書へ入れてしまうことである。
「ゴミ」「死ぬ」を入れると日常語を巻き込むことは実測で分かっているので、
ここが落ちたら候補の出しかたが緩んだということになる。
"""

import sys
from pathlib import Path

import pytest

AI_DIR = Path(__file__).resolve().parent.parent
for _path in (str(AI_DIR), str(AI_DIR / "dictionaries")):
    if _path not in sys.path:
        sys.path.insert(0, _path)

import harvest
import local_llm
import moderation_rules as rules


class _Replies(dict):
    """judge の返す内容と、usage_examples の返す例文をまとめて持つ。"""

    examples: dict


@pytest.fixture
def must_pass():
    return harvest.load_must_pass()


# ============================================================
# 安全装置。ここが本体
# ============================================================

@pytest.mark.parametrize("word,sentence", [
    ("ゴミ", "ゴミみたいなコードだ。"),
    ("アホ", "アホすぎる。"),
    ("死ぬ", "死ぬほどつらい。"),
    ("刺す", "刺すぞ。"),
    ("殴る", "殴るぞ。"),
    ("落ちる", "お前は落ちるべきだ。"),
    ("詰む", "詰むぞお前。"),
])
def test_入れてはいけない語は提案しない(must_pass, word, sentence):
    """README.md の「入れてはいけない語」。

    人間が実測したうえで「日常語と区別できない」と判断したものなので、
    通すべき文の集合を通過しても提案してはいけない。
    """
    assert harvest.suggest_rule(word, must_pass, found_in=sentence) is None


@pytest.mark.parametrize("word,sentence", [
    ("ポンコツ", "このポンコツが。"),
    ("低能", "低能すぎて話にならない。"),
    ("うすのろ", "うすのろが。"),
])
def test_安全な語は照合方法つきで提案する(must_pass, word, sentence):
    suggestion = harvest.suggest_rule(word, must_pass, found_in=sentence)
    assert suggestion is not None
    rule_name, reason = suggestion
    assert rule_name in harvest.RULE_CANDIDATES
    assert reason


def test_元の文を弾けない照合方法は選ばない(must_pass):
    """何にも当たらない照合方法を「安全」と判定してはいけない。

    「死ぬ」に品詞「名詞」を当てると、死ぬは常に動詞なので一度も当たらない。
    通すべき文も弾かないため安全に見えるが、ただ効かないだけである（実測）。
    NEVER_SUGGEST を外しても、この条件だけで落ちること。
    """
    assert harvest._catches("死ぬ", "名詞", "死ぬほどつらい。") is False
    assert harvest._catches("ポンコツ", "substring", "このポンコツが。") is True


def test_通すべき文を弾く語は落とす(must_pass):
    """「ばかり」を巻き込む substring の「ばか」は通さないこと。"""
    broken = harvest._breaks_must_pass("ばか", "substring", must_pass)
    assert broken is not None, "通すべき文を弾くのに検出できていない"


def test_提案された語が通すべき文を壊さない(must_pass):
    """提案されたものを実際に辞書へ入れて、124件が通るか確かめる。"""
    for word, sentence in [("ポンコツ", "このポンコツが。"), ("低能", "低能すぎる。")]:
        rule_name, _ = harvest.suggest_rule(word, must_pass, found_in=sentence)
        rule = rules._RULE_NAMES.get(rule_name, rule_name)
        for text in must_pass:
            assert not rules.match_ng_words(text, {word: rule},
                                            fallback_to_substring=True), (word, text)


# ============================================================
# 集めるところ
# ============================================================

@pytest.fixture
def fake_llm(monkeypatch):
    """手元のLLMを差し替える。文ごとに返す内容を決める。

    **例文を出す側も必ず差し替える。** 差し替え忘れると、テストが
    実際のモデルを呼びに行って1件25秒かかる（実測で気づいた）。
    """
    replies = _Replies()
    replies.examples = {}

    def fake_judge(text):
        return replies.get(text)

    def fake_examples(word):
        return replies.examples.get(word, [])

    for module in (local_llm, harvest.local_llm):
        monkeypatch.setattr(module, "judge", fake_judge)
        monkeypatch.setattr(module, "usage_examples", fake_examples)

    return replies


def test_規則で弾ける文はLLMに聞かない(fake_llm):
    """聞くだけ遅くなる。1件5秒かかるので無駄にできない。"""
    asked = []

    def spy(text):
        asked.append(text)
        return None

    fake_llm["dummy"] = None
    harvest.local_llm.judge = spy
    harvest.harvest(["消えたい。", "死ね"])
    assert asked == [], "規則で block になる文をLLMへ送っている"


def test_すでに辞書にある語は候補にしない(fake_llm):
    fake_llm["あいつは無能だ。"] = {
        "action": "block", "reasonCodes": ["harsh_criticism"], "words": ["無能"],
    }
    assert harvest.harvest(["あいつは無能だ。"]) == []


def test_候補を辞書ごとに分けて出す(fake_llm):
    fake_llm["このポンコツが。"] = {
        "action": "block", "reasonCodes": ["harsh_criticism"], "words": ["ポンコツ"],
    }
    found = harvest.harvest(["このポンコツが。"])
    assert len(found) == 1
    assert found[0]["word"] == "ポンコツ"
    assert found[0]["dictionary"] == "rewrite"
    assert found[0]["found_in"] == "このポンコツが。"

    lines = harvest.format_lines(found)
    assert "rewrite.txt" in lines
    assert "ポンコツ\t" in lines


def test_普通の使い方がある語は保留にする(fake_llm):
    """「ゴミみたいなコードだ」から「コード」が候補に出た（実測）。

    通すべき文の集合に「コード」を含む文が無かったためである。
    辞書へ入れれば技術の話が全部弾かれる。
    自動で捨てず、例文をつけて人へ見せる。
    """
    fake_llm["ゴミみたいなコードだ。"] = {
        "action": "block", "reasonCodes": ["harsh_criticism"], "words": ["コード"],
    }
    fake_llm.examples["コード"] = ["このコードを実行すると、プログラムが動作します。"]
    fake_llm["このコードを実行すると、プログラムが動作します。"] = {
        "action": "allow", "reasonCodes": [], "words": [],
    }

    found = harvest.harvest(["ゴミみたいなコードだ。"])
    assert len(found) == 1
    assert found[0]["innocent"], "普通の使い方を拾えていない"

    lines = harvest.format_lines(found)
    assert "保留" in lines
    assert "このコードを実行すると" in lines, "例文を見せていない"
    # 保留の行はすべて # で始まる。貼っても辞書に効かない形にしておく
    for line in lines.splitlines():
        if "コード" in line and line.strip():
            assert line.startswith("#"), f"貼れる形で出している: {line}"


def test_普通の使い方が無ければ候補のまま(fake_llm):
    fake_llm["このポンコツが。"] = {
        "action": "block", "reasonCodes": ["harsh_criticism"], "words": ["ポンコツ"],
    }
    fake_llm.examples["ポンコツ"] = []

    found = harvest.harvest(["このポンコツが。"])
    assert found[0]["innocent"] == []
    lines = harvest.format_lines(found)
    assert "保留" not in lines
    assert "ポンコツ\tsubstring" in lines


def test_危険な語はLLMが挙げても捨てる(fake_llm):
    fake_llm["ゴミみたいなコードだ。"] = {
        "action": "block", "reasonCodes": ["harsh_criticism"], "words": ["ゴミ"],
    }
    assert harvest.harvest(["ゴミみたいなコードだ。"]) == []


def test_重い理由コードを優先して振り分ける():
    assert harvest._pick_dictionary(["harsh_criticism", "self_harm"]) == "self_harm"
    assert harvest._pick_dictionary(["harsh_criticism"]) == "rewrite"
    assert harvest._pick_dictionary([]) == "rewrite"


def test_候補が無ければそう言う():
    assert "候補はありません" in harvest.format_lines([])


# ============================================================
# local_llm の入口
# ============================================================

def test_長い語は捨てる(monkeypatch):
    """モデルは文をそのまま words へ入れてくることがある（実測）。

    辞書は語単位で照合するので、文が入っても使えない。
    """
    import json

    monkeypatch.setattr(local_llm, "_ask", lambda i, t: json.dumps({
        "problem": True, "codes": ["harsh_criticism"],
        "words": ["無能", "お前の書いたもの全部やり直しな"],
    }, ensure_ascii=False))
    assert local_llm.judge("なにか")["words"] == ["無能"]


def test_語を挙げていれば問題ありにする(monkeypatch):
    """problem を false にしながら words へ語を入れてくることがある（実測）。"""
    import json

    monkeypatch.setattr(local_llm, "_ask", lambda i, t: json.dumps({
        "problem": False, "codes": [], "words": ["無能"],
    }, ensure_ascii=False))
    assert local_llm.judge("なにか")["action"] == "block"


def test_知らない理由コードは捨てる(monkeypatch):
    import json

    monkeypatch.setattr(local_llm, "_ask", lambda i, t: json.dumps({
        "problem": True, "codes": ["harsh_criticism", "make_believe"], "words": [],
    }, ensure_ascii=False))
    assert local_llm.judge("なにか")["reasonCodes"] == ["harsh_criticism"]


def test_JSONとして読めなければNone(monkeypatch):
    monkeypatch.setattr(local_llm, "_ask", lambda i, t: "これはJSONではありません")
    assert local_llm.judge("なにか") is None


def test_空文字列はValueError():
    with pytest.raises(ValueError):
        local_llm.judge("")


def test_使えないときのやり方を出せる():
    text = local_llm.describe_setup()
    assert "ollama pull" in text
    assert local_llm.DEFAULT_MODEL in text
