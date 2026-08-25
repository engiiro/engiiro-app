"""transform() と transform_text() の契約を確かめる。

Codex-Local::akatonboboonboon の独立レビュー（#21::…::01 の3番）で
「変換契約全体のテストが無い」と指摘された箇所。

APIは呼ばない。_call_api を差し替えて、何回どんな順で呼ばれたか、
戻り値がどうなるかを見る。実APIが要るものはここでは扱わない。
"""

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import transform_api as T


class FakeResponse:
    """google-genai の応答のうち、_extract_text が見る部分だけ。"""

    def __init__(self, text):
        self.text = text
        self.candidates = []


@pytest.fixture
def calls(monkeypatch):
    """_call_api を差し替え、呼び出しを記録する。

    返す文字列は scripted へ順に積む。足りなくなったら最後のものを使い回す。
    json_mode で呼ばれたかどうかも記録するので、
    判定と変換のどちらの呼び出しかを見分けられる。
    """
    log = []
    scripted = []

    def fake(client, system_instruction, contents, *, json_mode=False, thinking_off=True):
        log.append({
            "json_mode": json_mode,
            "instruction": system_instruction,
            "text": contents[-1]["parts"][0]["text"],
        })
        if not scripted:
            raise AssertionError("台本が空のまま呼ばれました")
        return FakeResponse(scripted.pop(0) if len(scripted) > 1 else scripted[0])

    monkeypatch.setattr(T, "_call_api", fake)
    # 外部モデレーションは環境変数が無ければ何もしないが、明示的に止める
    monkeypatch.setattr(T.external_moderation, "check", lambda text: [])
    log.append  # noqa: B018  （下の script が使う）
    return {"log": log, "script": scripted}


def _allow():
    return json.dumps({"action": "allow", "reasonCodes": []}, ensure_ascii=False)


def _verdict(action, codes):
    return json.dumps({"action": action, "reasonCodes": codes}, ensure_ascii=False)


# ============================================================
# 入力の検査。APIを呼ぶ前に落ちること
# ============================================================

@pytest.mark.parametrize("mode,text", [
    ("baby", ""),
    ("baby", "   "),
    ("mother", "\n"),
    ("papa", "テスト"),
    ("baby", "あ" * (T.MAX_INPUT_CHARS + 1)),
])
def test_おかしな入力はAPIを呼ぶ前にValueError(calls, mode, text):
    with pytest.raises(ValueError):
        T.transform(mode, text, client=object())
    assert calls["log"] == [], "検査より先にAPIを呼んでいる"


def test_入力の上限ちょうどは通る(calls):
    calls["script"].extend([_allow(), "へんかんしたよ", _allow()])
    result = T.transform("baby", "あ" * T.MAX_INPUT_CHARS, client=object())
    assert result["action"] == "allow"


# ============================================================
# APIキーが無いとき
# ============================================================

def test_APIキーが無ければRuntimeError(monkeypatch):
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    with pytest.raises(RuntimeError) as err:
        T.build_client()
    assert "GOOGLE_API_KEY" in str(err.value)


def test_APIキーが無いときclientを渡していれば動く(calls, monkeypatch):
    """判定だけなら規則で完結する経路もあるが、変換はclientが要る。

    client を明示で渡した場合、build_client は呼ばれない。
    """
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    calls["script"].extend([_allow(), "へんかんしたよ", _allow()])
    result = T.transform("baby", "テストです", client=object())
    assert result["transformedText"] == "へんかんしたよ"


# ============================================================
# 呼び出し回数。レート制限と費用に直接ひびく
# ============================================================

def test_通常の変換はGeminiを3回呼ぶ(calls):
    calls["script"].extend([_allow(), "へんかんしたよ", _allow()])
    T.transform("baby", "テストです", client=object())

    assert len(calls["log"]) == 3
    assert [c["json_mode"] for c in calls["log"]] == [True, False, True], \
        "判定→変換→判定の順でなければならない"


def test_規則でblockなら1回も呼ばない(calls):
    result = T.transform("baby", "死にたい。", client=object())
    assert result == {"action": "block", "transformedText": None,
                      "reasonCodes": ["self_harm"]}
    assert calls["log"] == [], "規則で決まったのにAPIを呼んでいる"


# ============================================================
# 150文字超過。最大1回だけ作り直す
# ============================================================

def test_長すぎたら1回だけ作り直す(calls):
    long = "あ" * (T.MAX_OUTPUT_CHARS + 1)
    calls["script"].extend([_allow(), long, "みじかいよ", _allow()])
    result = T.transform("baby", "テストです", client=object())

    assert result["transformedText"] == "みじかいよ"
    assert len(calls["log"]) == 4, "判定→変換→再変換→判定の4回"
    # 2回目の変換は、作り直しの指示が入った内容で呼ばれる
    assert calls["log"][1]["text"] != calls["log"][2]["text"]


def test_作り直しても長ければ切り捨てずに諦める(calls):
    long = "あ" * (T.MAX_OUTPUT_CHARS + 1)
    calls["script"].extend([_allow(), long, long, _allow()])
    with pytest.raises(RuntimeError) as err:
        T.transform("baby", "テストです", client=object())
    assert "切り捨てはしません" in str(err.value)


def test_150文字ちょうどは作り直さない(calls):
    exact = "あ" * T.MAX_OUTPUT_CHARS
    calls["script"].extend([_allow(), exact, _allow()])
    result = T.transform("baby", "テストです", client=object())
    assert result["transformedText"] == exact
    assert len(calls["log"]) == 3


# ============================================================
# 変換後モデレーション。ここが本題
# ============================================================

def test_変換後blockなら変換結果を返さない(calls):
    calls["script"].extend([_allow(), "だめなことばになったよ",
                            _verdict("block", ["ng_word"])])
    result = T.transform("baby", "テストです", client=object())

    assert result["action"] == "block"
    assert result["transformedText"] is None
    assert result["reasonCodes"] == ["ng_word"]


def test_変換後のrewrite_requiredを捨てない(calls):
    """変換前は allow、変換後だけ rewrite_required になった場合。

    以前はここを捨てていて allow / [] を返していた。
    捨てると、変換後に判定する意味がなくなる。
    """
    calls["script"].extend([_allow(), "ちょっとひどいことばになったよ",
                            _verdict("rewrite_required", ["harsh_criticism"])])
    result = T.transform("baby", "テストです", client=object())

    assert result["action"] == "rewrite_required"
    assert result["reasonCodes"] == ["harsh_criticism"]
    assert result["transformedText"] == "ちょっとひどいことばになったよ", \
        "block ではないので、変換結果は返す"


def test_変換前と変換後の理由コードを合わせる(calls):
    calls["script"].extend([
        _verdict("rewrite_required", ["harsh_criticism"]),
        "へんかんしたよ",
        _verdict("rewrite_required", ["ng_word"]),
    ])
    result = T.transform("baby", "テストです", client=object())
    assert result["reasonCodes"] == ["harsh_criticism", "ng_word"]


def test_変換前rewrite_requiredは変換後allowでも残る(calls):
    calls["script"].extend([
        _verdict("rewrite_required", ["harsh_criticism"]),
        "やさしいことばになったよ",
        _allow(),
    ])
    result = T.transform("baby", "テストです", client=object())
    assert result["action"] == "rewrite_required", \
        "変換で表面が和らいでも、元の投稿への指摘は消えない"
    assert result["reasonCodes"] == ["harsh_criticism"]


# ============================================================
# 重さの比較そのもの
# ============================================================

@pytest.mark.parametrize("first,second,expected", [
    ("allow", "allow", "allow"),
    ("allow", "rewrite_required", "rewrite_required"),
    ("rewrite_required", "allow", "rewrite_required"),
    ("allow", "block", "block"),
    ("block", "allow", "block"),
    ("rewrite_required", "block", "block"),
    ("block", "rewrite_required", "block"),
    ("block", "block", "block"),
])
def test_重いほうを採る(first, second, expected):
    assert T.severer(first, second) == expected


def test_判定の重さは3段階すべて並ぶ():
    assert T.SEVERITY["allow"] < T.SEVERITY["rewrite_required"] < T.SEVERITY["block"]


# ============================================================
# transform_text。判定を挟まない素の変換
# ============================================================

def test_transform_textは判定を呼ばない(calls):
    calls["script"].append("へんかんしたよ")
    assert T.transform_text("baby", "テストです", client=object()) == "へんかんしたよ"
    assert len(calls["log"]) == 1
    assert calls["log"][0]["json_mode"] is False


def test_空応答はRuntimeError(calls):
    calls["script"].append("   ")
    with pytest.raises(RuntimeError) as err:
        T.transform_text("baby", "テストです", client=object())
    assert "空の応答" in str(err.value)


def test_babyとmotherで違う指示を使う(calls):
    calls["script"].append("へんかんしたよ")
    T.transform_text("baby", "テストです", client=object())
    baby = calls["log"][0]["instruction"]

    calls["log"].clear()
    calls["script"].append("へんかんしたよ")
    T.transform_text("mother", "テストです", client=object())
    mother = calls["log"][0]["instruction"]

    assert baby != mother
    assert baby == T.INSTRUCTIONS["baby"]
    assert mother == T.INSTRUCTIONS["mother"]


# ============================================================
# moderate の応答が壊れているとき
# ============================================================

def test_判定が壊れたJSONならRuntimeError(calls):
    calls["script"].append("これはJSONではありません")
    with pytest.raises(RuntimeError):
        T.moderate("テストです", client=object())


def test_判定のコードブロックを剥がす(calls):
    calls["script"].append("```json\n" + _allow() + "\n```")
    assert T.moderate("テストです", client=object())["action"] == "allow"


def test_空文字列は判定できない():
    with pytest.raises(ValueError):
        T.moderate("", client=object())
