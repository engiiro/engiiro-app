"""判定APIと変換APIの契約を確かめる。

Codex-Local::akatonboboonboon の独立レビュー（#21::…::01 の3番）で
「変換契約全体のテストが無い」と指摘された箇所。

人間監督の決定により、2つのAPIは性質が違う。

    判定API  moderate()      通信しない。API制限を消費しない
    変換API  transform()     Gemini を使う。ここだけ制限を消費する

ここでは実際のAPIを呼ばない。_call_api を差し替えて、
何回どんな順で呼ばれたか、戻り値がどうなるかを見る。
**判定APIが1回も _call_api を呼ばないことも、ここで固定している。**
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

    返す文字列は script へ順に積む。足りなくなったら最後のものを使い回す。
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
    return {"log": log, "script": scripted}


@pytest.fixture
def no_network(monkeypatch):
    """通信しないはずの経路で、うっかり通信したら落ちるようにする。"""
    def boom(*args, **kwargs):
        raise AssertionError("通信しないはずの経路でAPIを呼びました")

    monkeypatch.setattr(T, "_call_api", boom)
    monkeypatch.setattr(T.external_moderation, "check", boom)
    monkeypatch.setattr(T, "build_client", boom)


# ============================================================
# 判定API。通信しないことが最も大事な性質
# ============================================================

@pytest.mark.parametrize("text,action,codes", [
    ("今日は仕様書をレビューしました。", "allow", []),
    ("テストが全部落ちた。つらい。", "allow", []),
    ("React.js の index.ts が壊れた。", "allow", []),
    ("まったく無能だ。", "block", ["harsh_criticism"]),
    ("きえろ。", "block", ["ng_word"]),
    ("消えたい。", "block", ["self_harm"]),
    ("殺してやる。", "block", ["harm_others"]),
    ("首を吊って死ぬ。", "block", ["self_harm"]),
])
def test_判定APIは通信せずに判定する(no_network, text, action, codes):
    verdict = T.moderate(text)
    assert verdict["action"] == action
    assert verdict["reasonCodes"] == codes
    assert verdict["score"] is None, "mode を渡していないので採点しない"


def test_判定APIはclientを受け取らない():
    """通信しないので client を渡す余地が無い。

    引数に残しておくと「渡せば通信する」と誤解されるため、
    署名から外していることをここで固定する。
    """
    with pytest.raises(TypeError):
        T.moderate("テストです", client=object())


def test_判定APIは空文字列をValueError(no_network):
    for bad in ("", "   ", "\n"):
        with pytest.raises(ValueError):
            T.moderate(bad)


@pytest.mark.parametrize("code", ["self_harm", "harm_others", "harsh_criticism"])
def test_判定APIは必ず弾く理由コードでblockへ倒す(no_network, monkeypatch, code):
    """辞書側の設定が緩められても block になること。

    人間監督の決定に対する二重の保険。
        「自傷・他害は絶対に弾いてください」
        「マサカリは完全にブロックにしましょう。状況によって変えません」
    """
    monkeypatch.setattr(T, "check_rules",
                        lambda text: {"action": "rewrite_required",
                                      "reasonCodes": [code]})
    assert T.moderate("なにか")["action"] == "block"


def test_判定APIは必ず弾く対象でない理由コードでは倒さない(no_network, monkeypatch):
    monkeypatch.setattr(T, "check_rules",
                        lambda text: {"action": "rewrite_required",
                                      "reasonCodes": ["sexual_explicit"]})
    assert T.moderate("なにか")["action"] == "rewrite_required"


def test_辞書はrewrite_requiredを返さなくなった(no_network):
    """マサカリが block になったため、規則からは3状態のうち2つしか出ない。

    仕様書 FR-AI-TRANS-002 は3状態を要求しているが、
    判定APIが返すのは allow と block だけになった。
    状態そのものを契約から外すかは人間監督の判断を待っている。
    """
    for text in ("今日は仕様書をレビューしました。", "まったく無能だ。",
                 "消えたい。", "きえろ。", "殺してやる。"):
        assert T.moderate(text)["action"] in ("allow", "block")


# ============================================================
# 変換API。入力の検査はAPIを呼ぶ前に効くこと
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


def test_変換APIの入力上限ちょうどは通る(calls):
    calls["script"].append("へんかんしたのー")
    result = T.transform("baby", "あ" * T.MAX_TRANSFORM_INPUT_CHARS, client=object())
    assert result["action"] != "block", "上限ちょうどは弾かれない"
    assert result["transformedText"] == "へんかんしたのー"


# ============================================================
# APIキーが無いとき
# ============================================================

def test_APIキーが無ければRuntimeError(monkeypatch):
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    with pytest.raises(RuntimeError) as err:
        T.build_client()
    assert "GOOGLE_API_KEY" in str(err.value)


def test_APIキーが無くても判定APIは動く(no_network, monkeypatch):
    """判定APIは通信しないので、キーの有無に関係なく動く。

    これが「API制限を使わない判定API」の実際の意味である。
    """
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    assert T.moderate("消えたい。")["action"] == "block"


def test_APIキーが無くても規則でblockできる入力は弾ける(monkeypatch):
    """判定はクライアントを作る前に行うこと。

    Codex-Local::akatonboboonboon の指摘（#21::…::02 の2番）。
    先にクライアントを作ると、ローカルだけで弾ける入力まで
    キーのエラーで落ちる。生成APIが止まっている間も
    判定だけで動かせる必要があるため、通信の準備は後回しにする。
    """
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)

    def boom(*args, **kwargs):
        raise AssertionError("判定より先にクライアントを作っています")

    monkeypatch.setattr(T, "build_client", boom)
    monkeypatch.setattr(T, "_call_api", boom)

    result = T.transform("baby", "消えたい。")
    assert result["action"] == "block"
    assert result["reasonCodes"] == ["self_harm"]
    assert result["transformedText"] is None


def test_APIキーが無いと変換の必要な入力ではRuntimeError(monkeypatch):
    """弾けない入力は、結局クライアントが要る。"""
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    with pytest.raises(RuntimeError) as err:
        T.transform("baby", "テストが全部落ちた。")
    assert "GOOGLE_API_KEY" in str(err.value)


def test_APIキーが無くてもclientを渡せば変換できる(calls, monkeypatch):
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    calls["script"].append("へんかんしたよ")
    assert T.transform("baby", "テストです",
                       client=object())["transformedText"] == "へんかんしたよ"


# ============================================================
# 呼び出し回数。レート制限と費用に直接ひびく
# ============================================================

def test_通常の変換はGeminiを1回だけ呼ぶ(calls):
    """判定が前後2回あっても、判定はローカルなので枠を使わない。

    Gemini を使うのは変換の1回だけである。
    """
    calls["script"].append("へんかんしたよ")
    T.transform("baby", "テストです", client=object())

    assert len(calls["log"]) == 1
    assert calls["log"][0]["json_mode"] is False, "判定でAPIを呼んでいる"


def test_規則でblockなら1回も呼ばない(calls):
    result = T.transform("baby", "消えたい。", client=object())
    assert result["action"] == "block"
    assert result["transformedText"] is None
    assert result["reasonCodes"] == ["self_harm"]
    assert calls["log"] == [], "規則で決まったのにAPIを呼んでいる"


# ============================================================
# 文字数の上限。変換を使うかどうかで違う
# ============================================================
# 人間監督の決定：
#   「生成を押す場合の入力上限を100文字以下にし、かつ変換後150文字超えたら
#     弾いて書き直させましょう。生成しない自力でやるときは150文字でいいです」
#
#   変換API  入力100文字 / 変換結果150文字（超えたら too_long）
#   判定API  入力150文字
#
# 変換結果が長すぎても作り直さない。作り直すとAPIを2回呼ぶことになる。

def test_出力が長すぎたら作り直さず書き直してもらう(calls):
    """人間監督の決定：「変換後150文字超えたら弾いて書き直させましょう」

    作り直すとAPIを2回呼ぶことになるので、作り直さない。
    """
    long = "あ" * (T.MAX_OUTPUT_CHARS + 1)
    calls["script"].append(long)
    result = T.transform("baby", "ねむいのー", client=object())

    assert result["action"] == "rewrite_required"
    assert result["transformedText"] is None, "弾くので変換結果は返さない"
    assert "too_long" in result["reasonCodes"]
    assert len(calls["log"]) == 1, "作り直さないので変換の1回だけ"


def test_出力が長すぎても変換後の判定は飛ばさない(calls):
    """長さで先に打ち切ると、変換後モデレーションを飛ばすことになる。

    Codex-Local::akatonboboonboon の指摘（#21::…::05 の1番）。
    仕様書 FR-MOD-002 は変換後の出力もモデレーションの対象としている。
    NG語を含んだうえで長い変換結果は、too_long ではなく block である。
    """
    calls["script"].append("おまえなんてきえろ" + "のー" * 80)
    result = T.transform("baby", "ねむいのー", client=object())

    assert result["action"] == "block", "長さより先にNG語を見ること"
    assert result["reasonCodes"] == ["ng_word"]
    assert result["transformedText"] is None


def test_出力の上限ちょうどは通る(calls):
    exact = "あ" * T.MAX_OUTPUT_CHARS
    calls["script"].append(exact)
    result = T.transform("baby", "ねむいのー", client=object())
    assert result["transformedText"] == exact
    assert "too_long" not in result["reasonCodes"]


def test_入力の上限は判定150文字_変換100文字(calls):
    """人間監督の決定：

    「生成を押す場合の入力上限を100文字以下にし、（中略）
      生成しない自力でやるときは150文字でいいです」
    """
    assert T.MAX_INPUT_CHARS == 150
    assert T.MAX_TRANSFORM_INPUT_CHARS == 100

    with pytest.raises(ValueError) as err:
        T.transform("baby", "あ" * 101, client=object())
    assert "100" in str(err.value)
    assert calls["log"] == []


def test_判定APIは150文字まで受ける(no_network):
    T.moderate("あ" * 150, "baby")
    with pytest.raises(ValueError) as err:
        T.moderate("あ" * 151, "baby")
    assert "150" in str(err.value)



# ============================================================
# 変換後の判定。仕様書 FR-MOD-002
# ============================================================

def test_変換後blockなら変換結果を返さない(calls):
    """変換によって新しくNG語が生じた場合。

    変換前は問題なしなので、後段の判定が効いていないと素通りする。
    原文を満点の赤ちゃん語にして、点数由来の指摘が混ざらないようにしてある。
    """
    calls["script"].append("おまえなんてきえろなのー")
    result = T.transform("baby", "ねむいのー", client=object())

    assert result["action"] == "block"
    assert result["transformedText"] is None
    assert result["reasonCodes"] == ["ng_word"]
    assert result["score"] == 100, "原文は赤ちゃん語として満点"


def test_変換後のマサカリも弾く(calls):
    """変換前は問題なし、変換によってマサカリ語が生じた場合。

    後段の判定が効いていないと素通りする。
    """
    calls["script"].append("まったく カスなのー")
    result = T.transform("baby", "ねむいのー", client=object())

    assert result["action"] == "block"
    assert result["reasonCodes"] == ["harsh_criticism"]
    assert result["transformedText"] is None


def test_変換後のrewrite_requiredを捨てない(calls, monkeypatch):
    """変換前は allow、変換後だけ rewrite_required になった場合。

    以前はここを捨てていて allow / [] を返していた。
    捨てると、変換後に判定する意味がなくなる。

    いまの辞書は rewrite_required を返さないので、判定を差し替えて確かめる。
    どちらの文も満点の赤ちゃん語にして、点数由来の指摘が混ざらないようにしてある。
    """
    verdicts = iter([
        {"action": "allow", "reasonCodes": []},
        {"action": "rewrite_required", "reasonCodes": ["sexual_explicit"]},
    ])
    monkeypatch.setattr(T, "check_rules", lambda text: next(verdicts))

    calls["script"].append("へんかんしたのー")
    result = T.transform("baby", "ねむいのー", client=object())

    assert result["action"] == "rewrite_required"
    assert result["reasonCodes"] == ["sexual_explicit"]
    assert result["transformedText"] == "へんかんしたのー", \
        "block ではないので、変換結果は返す"


def test_変換前と変換後の理由コードを合わせる(calls, monkeypatch):
    verdicts = iter([
        {"action": "rewrite_required", "reasonCodes": ["sexual_explicit"]},
        {"action": "block", "reasonCodes": ["ng_word"]},
    ])
    monkeypatch.setattr(T, "check_rules", lambda text: next(verdicts))

    calls["script"].append("へんかんしたのー")
    result = T.transform("baby", "ねむいのー", client=object())
    assert result["action"] == "block"
    assert result["reasonCodes"] == ["ng_word", "sexual_explicit"]


def test_変換前rewrite_requiredは変換後allowでも残る(calls, monkeypatch):
    verdicts = iter([
        {"action": "rewrite_required", "reasonCodes": ["sexual_explicit"]},
        {"action": "allow", "reasonCodes": []},
    ])
    monkeypatch.setattr(T, "check_rules", lambda text: next(verdicts))

    calls["script"].append("やさしくなったのー")
    result = T.transform("baby", "ねむいのー", client=object())
    assert result["action"] == "rewrite_required", \
        "変換で表面が和らいでも、元の投稿への指摘は消えない"
    assert result["reasonCodes"] == ["sexual_explicit"]


def test_変換後の判定も通信しない(calls, monkeypatch):
    """変換後の判定でも外部サービスへ送らないこと。

    変換結果は原文由来なので、ここで外へ出すと原文の内容が漏れる。
    """
    monkeypatch.setattr(T.external_moderation, "check",
                        lambda text: (_ for _ in ()).throw(
                            AssertionError("変換後の判定で外部へ送っています")))
    calls["script"].append("へんかんしたのー")
    assert T.transform("baby", "ねむいのー", client=object())["action"] == "allow"


# ============================================================
# 判定の合成。規則・LLM・外部4種をまとめる中核
# ============================================================

def test_合成は重いほうへ寄せる():
    merged = T.merge_verdicts(
        {"action": "allow", "reasonCodes": []},
        {"action": "rewrite_required", "reasonCodes": ["harsh_criticism"]},
        {"action": "allow", "reasonCodes": []},
    )
    assert merged == {"action": "rewrite_required", "reasonCodes": ["harsh_criticism"]}


def test_合成は1つでもblockがあればblock():
    merged = T.merge_verdicts(
        {"action": "allow", "reasonCodes": []},
        {"action": "block", "reasonCodes": ["self_harm"]},
        {"action": "rewrite_required", "reasonCodes": ["ng_word"]},
    )
    assert merged["action"] == "block"
    assert merged["reasonCodes"] == ["ng_word", "self_harm"], "軽い側の理由も残す"


def test_合成は理由コードを捨てない():
    """allow の判定が混ざっても、他が挙げた理由は消えない。

    外部APIは1社が拾って他が見逃すことが普通にある。
    多数決ではなく、1つでも挙げたら残す。
    """
    merged = T.merge_verdicts(
        {"action": "allow", "reasonCodes": []},
        {"action": "allow", "reasonCodes": []},
        {"action": "rewrite_required", "reasonCodes": ["ng_word"]},
    )
    assert merged["reasonCodes"] == ["ng_word"]


def test_合成は理由コードの重複を畳む():
    merged = T.merge_verdicts(
        {"action": "block", "reasonCodes": ["self_harm"]},
        {"action": "block", "reasonCodes": ["self_harm", "harm_others"]},
    )
    assert merged["reasonCodes"] == ["harm_others", "self_harm"]


def test_合成は理由コードが無くても落ちない():
    assert T.merge_verdicts({"action": "allow"}) == {"action": "allow", "reasonCodes": []}


def test_合成の引数が1つでも動く():
    one = {"action": "rewrite_required", "reasonCodes": ["harsh_criticism"]}
    assert T.merge_verdicts(one) == one


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

def test_transform_textは判定を挟まない(calls):
    calls["script"].append("おまえなんてきえろ")
    assert T.transform_text("baby", "テストです",
                            client=object()) == "おまえなんてきえろ"
    assert len(calls["log"]) == 1, "判定は行わない関数なので変換の1回だけ"


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
# thinking 設定。断られたら覚えること
# ============================================================
# 毎回試すと1回の変換で必ず2回APIを呼ぶ。制限を2倍消費するので、
# 一度断られたら以降は付けずに呼ぶ。実測で見つけた無駄である。

class FakeModels:
    """thinking_config を渡されると 400 を返すモデル。

    gemini-3.5-flash-lite の実際のふるまい。
    """

    def __init__(self):
        self.calls = []

    def generate_content(self, *, model, contents, config):
        thinking = getattr(config, "thinking_config", None)
        self.calls.append(thinking is not None)
        if thinking is not None:
            raise Exception("400 INVALID_ARGUMENT. Request contains an invalid argument.")
        return FakeResponse("へんかんしたよ")


class FakeClient:
    def __init__(self):
        self.models = FakeModels()


@pytest.fixture
def thinking_reset(monkeypatch):
    """モジュール全体の状態なので、テストごとに戻す。"""
    monkeypatch.setattr(T, "THINKING_SUPPORTED", True)


def test_thinking設定を断られたら覚えて2回目からは付けない(thinking_reset):
    client = FakeClient()

    T.transform_text("baby", "テストです", client=client)
    assert client.models.calls == [True, False], "1回目は試して、断られて呼び直す"

    T.transform_text("baby", "テストです", client=client)
    assert client.models.calls == [True, False, False], \
        "2回目は最初から付けない。付けるとAPI消費が2倍になる"

    T.transform_text("baby", "テストです", client=client)
    assert client.models.calls.count(True) == 1, "試すのは最初の1回だけ"


def test_thinking設定が通るなら付け続ける(thinking_reset):
    class Accepting(FakeModels):
        def generate_content(self, *, model, contents, config):
            self.calls.append(getattr(config, "thinking_config", None) is not None)
            return FakeResponse("へんかんしたよ")

    client = FakeClient()
    client.models = Accepting()

    T.transform_text("baby", "テストです", client=client)
    T.transform_text("baby", "テストです", client=client)
    assert client.models.calls == [True, True], "通るモデルでは外さない"
    assert T.THINKING_SUPPORTED is True


def test_400以外のエラーは覚えずにそのまま投げる(thinking_reset):
    class Failing(FakeModels):
        def generate_content(self, *, model, contents, config):
            self.calls.append(getattr(config, "thinking_config", None) is not None)
            raise Exception("500 INTERNAL error")

    client = FakeClient()
    client.models = Failing()

    with pytest.raises(RuntimeError):
        T.transform_text("baby", "テストです", client=client)
    assert client.models.calls == [True], "呼び直さない"
    assert T.THINKING_SUPPORTED is True, "無関係なエラーで諦めてはいけない"


# ============================================================
# moderate_by_llm。辞書を育てるための道具
# ============================================================
# 判定APIではない。API制限を消費するので、判定の経路から呼んではいけない。

def test_LLM判定は形態素解析で拾えないマサカリを拾える(calls, monkeypatch):
    """この関数が存在する理由そのもの。

    「なんでこんなコード書いたの。ありえないんだけど。」は
    語単位では表れないため、形態素解析では allow になる。
    """
    monkeypatch.setattr(T.external_moderation, "check", lambda text: [])
    masakari = "なんでこんなコード書いたの。ありえないんだけど。"

    assert T.moderate(masakari)["action"] == "allow", "規則では拾えない"

    calls["script"].append(json.dumps(
        {"action": "rewrite_required", "reasonCodes": ["harsh_criticism"]},
        ensure_ascii=False))
    assert T.moderate_by_llm(masakari, client=object())["action"] == "block", \
        "LLM が rewrite_required と答えても、マサカリは block へ倒す"


def test_LLM判定は規則でblockなら外部へ送らない(calls, monkeypatch):
    monkeypatch.setattr(T.external_moderation, "check",
                        lambda text: (_ for _ in ()).throw(
                            AssertionError("規則でblockなのに外部へ送っています")))
    result = T.moderate_by_llm("電話番号は090-1234-5678です。", client=object())
    assert result["action"] == "block"
    assert calls["log"] == []


def test_LLM判定が壊れたJSONならRuntimeError(calls, monkeypatch):
    monkeypatch.setattr(T.external_moderation, "check", lambda text: [])
    calls["script"].append("これはJSONではありません")
    with pytest.raises(RuntimeError):
        T.moderate_by_llm("テストです", client=object())


def test_LLM判定のコードブロックを剥がす(calls, monkeypatch):
    monkeypatch.setattr(T.external_moderation, "check", lambda text: [])
    calls["script"].append(
        "```json\n" + json.dumps({"action": "allow", "reasonCodes": []}) + "\n```")
    assert T.moderate_by_llm("テストです", client=object())["action"] == "allow"


def test_LLM判定は自傷をblockへ倒す(calls, monkeypatch):
    """LLM が self_harm を立てながら rewrite_required を返すことがある。"""
    monkeypatch.setattr(T.external_moderation, "check", lambda text: [])
    calls["script"].append(json.dumps(
        {"action": "rewrite_required", "reasonCodes": ["self_harm"]},
        ensure_ascii=False))
    assert T.moderate_by_llm("なにか", client=object())["action"] == "block"


def test_LLM判定は空文字列をValueError():
    with pytest.raises(ValueError):
        T.moderate_by_llm("", client=object())
