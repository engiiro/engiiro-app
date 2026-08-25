"""外部モデレーションAPIの組み込みを確かめる。

実際のAPIは叩かない。HTTPの部分を差し替えて、
カテゴリの対応づけと、落ちたときの振る舞いだけを見る。
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import external_moderation as E


@pytest.fixture(autouse=True)
def _clear_env(monkeypatch):
    """他のテストや実環境の設定を持ち込まない。"""
    for name in ("OPENAI_API_KEY", "AZURE_CONTENT_SAFETY_ENDPOINT",
                 "AZURE_CONTENT_SAFETY_KEY", "GOOGLE_CLOUD_NL_API_KEY",
                 "CHAKOSHI_API_KEY", "CHAKOSHI_GUARDRAIL_ID", "CHAKOSHI_API_URL"):
        monkeypatch.delenv(name, raising=False)
    E._warned.clear()


def _openai_response(*flagged):
    categories = {name: (name in flagged) for name in E._OPENAI_TO_REASON}
    return {"results": [{"flagged": bool(flagged), "categories": categories}]}


def _azure_response(**severities):
    return {"categoriesAnalysis": [
        {"category": name, "severity": severity}
        for name, severity in severities.items()
    ]}


# ============================================================
# 設定していなければ何もしない
# ============================================================

def test_設定が無ければ呼ばない(monkeypatch):
    def must_not_be_called(*args, **kwargs):
        raise AssertionError("設定が無いのに通信しています")
    monkeypatch.setattr(E, "_post_json", must_not_be_called)

    assert E.check("テスト") == []
    assert E.enabled_providers() == []
    assert E.check_openai("テスト") is None
    assert E.check_azure("テスト") is None
    assert E.check_google("テスト") is None
    assert E.check_chakoshi("テスト") is None


# ============================================================
# OpenAI
# ============================================================

def test_openai_自傷はblock(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(E, "_post_json", lambda *a, **k: _openai_response("self-harm"))
    verdict = E.check_openai("テスト")
    assert verdict == {"action": "block", "reasonCodes": ["self_harm"]}


def test_openai_暴力は他害としてblock(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(E, "_post_json", lambda *a, **k: _openai_response("violence"))
    assert E.check_openai("テスト") == {"action": "block", "reasonCodes": ["harm_others"]}


def test_openai_嫌がらせはrewrite_required(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(E, "_post_json", lambda *a, **k: _openai_response("harassment"))
    verdict = E.check_openai("テスト")
    assert verdict == {"action": "rewrite_required", "reasonCodes": ["harsh_criticism"]}


def test_openai_何も立たなければallow(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(E, "_post_json", lambda *a, **k: _openai_response())
    assert E.check_openai("テスト") == {"action": "allow", "reasonCodes": []}


def test_openai_方針未定のカテゴリは無視する(monkeypatch):
    # 性的な内容の扱いはえんじいろの仕様で決まっていない
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    response = {"results": [{"flagged": True, "categories": {"sexual": True}}]}
    monkeypatch.setattr(E, "_post_json", lambda *a, **k: response)
    assert E.check_openai("テスト") == {"action": "allow", "reasonCodes": []}


# ============================================================
# Azure
# ============================================================

@pytest.fixture
def azure_env(monkeypatch):
    monkeypatch.setenv("AZURE_CONTENT_SAFETY_ENDPOINT", "https://example.cognitiveservices.azure.com")
    monkeypatch.setenv("AZURE_CONTENT_SAFETY_KEY", "key")


def test_azure_しきい値以上でblock(monkeypatch, azure_env):
    monkeypatch.setattr(E, "_post_json", lambda *a, **k: _azure_response(SelfHarm=6))
    assert E.check_azure("テスト") == {"action": "block", "reasonCodes": ["self_harm"]}


def test_azure_しきい値未満は拾わない(monkeypatch, azure_env):
    monkeypatch.setattr(E, "_post_json", lambda *a, **k: _azure_response(SelfHarm=2))
    assert E.check_azure("テスト") == {"action": "allow", "reasonCodes": []}


def test_azure_URLを組み立てる(monkeypatch, azure_env):
    called = {}

    def capture(url, payload, headers):
        called["url"] = url
        called["headers"] = headers
        return _azure_response()

    monkeypatch.setattr(E, "_post_json", capture)
    E.check_azure("テスト")
    assert called["url"] == (
        "https://example.cognitiveservices.azure.com"
        "/contentsafety/text:analyze?api-version=2024-09-01"
    )
    assert "Ocp-Apim-Subscription-Key" in called["headers"]


def test_azure_末尾スラッシュがあっても壊れない(monkeypatch, azure_env):
    monkeypatch.setenv("AZURE_CONTENT_SAFETY_ENDPOINT",
                       "https://example.cognitiveservices.azure.com/")
    called = {}

    def capture(url, payload, headers):
        called["url"] = url
        return _azure_response()

    monkeypatch.setattr(E, "_post_json", capture)
    E.check_azure("テスト")
    assert "//contentsafety" not in called["url"]


# ============================================================
# 落ちたとき
# ============================================================

def test_落ちても例外にしない(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")

    def boom(*args, **kwargs):
        raise ConnectionError("つながりません")

    monkeypatch.setattr(E, "_post_json", boom)
    assert E.check_openai("テスト") is None
    assert E.check("テスト") == []   # 呼び出し側は素通しできる


def test_警告は1度だけ出す(monkeypatch, capsys):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(E, "_post_json",
                        lambda *a, **k: (_ for _ in ()).throw(ConnectionError("だめ")))
    for _ in range(5):
        E.check_openai("テスト")
    assert capsys.readouterr().err.count("[外部モデレーション]") == 1


# ============================================================
# 両方設定した場合
# ============================================================

def test_設定した分だけ問い合わせる(monkeypatch, azure_env):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(E, "check_openai",
                        lambda text: {"action": "allow", "reasonCodes": []})
    monkeypatch.setattr(E, "check_azure",
                        lambda text: {"action": "block", "reasonCodes": ["self_harm"]})
    monkeypatch.setitem(E.PROVIDERS, "openai", (E.openai_available, E.check_openai))
    monkeypatch.setitem(E.PROVIDERS, "azure", (E.azure_available, E.check_azure))

    verdicts = E.check("テスト")
    assert len(verdicts) == 2
    assert {v["provider"] for v in verdicts} == {"openai", "azure"}
    assert sorted(E.enabled_providers()) == ["azure", "openai"]


# ============================================================
# Google Cloud Natural Language
# ============================================================

def _google_response(**confidences):
    return {"moderationCategories": [
        {"name": name.replace("_", " "), "confidence": value}
        for name, value in confidences.items()
    ]}


@pytest.fixture
def google_env(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLOUD_NL_API_KEY", "key")


def test_google_侮辱はrewrite_required(monkeypatch, google_env):
    monkeypatch.setattr(E, "_post_json", lambda *a, **k: _google_response(Insult=0.95))
    verdict = E.check_google("テスト")
    assert verdict == {"action": "rewrite_required", "reasonCodes": ["harsh_criticism"]}


def test_google_差別的表現はblock(monkeypatch, google_env):
    monkeypatch.setattr(E, "_post_json", lambda *a, **k: _google_response(Derogatory=0.9))
    assert E.check_google("テスト") == {"action": "block", "reasonCodes": ["ng_word"]}


def test_google_しきい値未満は拾わない(monkeypatch, google_env):
    monkeypatch.setattr(E, "_post_json", lambda *a, **k: _google_response(Toxic=0.3))
    assert E.check_google("テスト") == {"action": "allow", "reasonCodes": []}


def test_google_話題の分類は拾わない(monkeypatch, google_env):
    """「祖父が亡くなった」で Death, Harm & Tragedy が高く出ても弾かない。

    Google のカテゴリには話題の分類が混ざっている。
    有害性ではないので、対応づけていない。
    """
    response = _google_response(**{"Death,_Harm_&_Tragedy": 0.99})
    monkeypatch.setattr(E, "_post_json", lambda *a, **k: response)
    assert E.check_google("祖父が亡くなった。") == {"action": "allow", "reasonCodes": []}


def test_google_健康や政治の話題を弾かない(monkeypatch, google_env):
    for topic in ("Health", "Politics", "Finance", "Legal", "Religion_&_Belief"):
        response = _google_response(**{topic: 0.99})
        monkeypatch.setattr(E, "_post_json", lambda *a, **k: response)
        assert E.check_google("テスト")["action"] == "allow", topic


def test_google_URLにキーを載せる(monkeypatch, google_env):
    called = {}

    def capture(url, payload, headers):
        called["url"] = url
        called["payload"] = payload
        return _google_response()

    monkeypatch.setattr(E, "_post_json", capture)
    E.check_google("テスト")
    assert called["url"].startswith("https://language.googleapis.com/v2/documents:moderateText?key=")
    assert called["payload"]["document"]["languageCode"] == "ja"


# ============================================================
# Google：日本語での実測値を使った回帰テスト
# ============================================================
# 2026-08 に実APIで測った値をそのまま入れている。
# しきい値を下げるとここが落ちる。落ちたら、下げてよいかを考え直すこと。

MEASURED = {
    # 「あいつは本当に無能だ。役立たず。」
    "罵倒": {"Toxic": 0.837, "Insult": 0.825, "Violent": 0.774,
             "Profanity": 0.523, "Derogatory": 0.138},
    # 「うんこもらしちゃったのー。」
    "幼児的な下ネタ": {"Profanity": 0.716, "Sexual": 0.628, "Toxic": 0.520},
    # 「つらい。しんどい。もう限界かもしれない。」
    "弱音": {"Health": 0.606, "Death, Harm & Tragedy": 0.190},
    # 「React.js のバージョンで詰んだ。サーバーが死んだ。」
    "技術用語": {"Death, Harm & Tragedy": 0.825},
    # 「殺してやる。」
    "脅迫": {"Violent": 0.996, "Toxic": 0.926, "Insult": 0.856,
             "Death, Harm & Tragedy": 0.704},
    # 「なんでこんなコード書いたの。ありえないんだけど。」
    "会話調のマサカリ": {"Health": 0.103},
    # 「成人向けゲームの開発でシナリオを書いている。」
    "成人向け作品の話": {"Finance": 0.102},
}


def _measured(name):
    return {"moderationCategories": [
        {"name": k, "confidence": v} for k, v in MEASURED[name].items()]}


def _verdict_for(monkeypatch, name):
    monkeypatch.setattr(E, "_post_json", lambda *a, **k: _measured(name))
    return E.check_google("（実測値を使用）")


def test_google_罵倒はrewrite_requiredで止まる(monkeypatch, google_env):
    """block ではなく rewrite_required であること。

    Violent が 0.774 出ているため、しきい値の余裕が足りないと
    ただの罵倒が block になる。
    """
    verdict = _verdict_for(monkeypatch, "罵倒")
    assert verdict["action"] == "rewrite_required", verdict
    assert "harm_others" not in verdict["reasonCodes"]


def test_google_幼児的な下ネタを弾かない(monkeypatch, google_env):
    # Profanity 0.716。人間監督の決定により、それ自体では弾かない
    assert _verdict_for(monkeypatch, "幼児的な下ネタ")["action"] == "allow"


def test_google_弱音を弾かない(monkeypatch, google_env):
    assert _verdict_for(monkeypatch, "弱音")["action"] == "allow"


def test_google_サーバーが死んだを弾かない(monkeypatch, google_env):
    """Death, Harm & Tragedy が 0.825 出るが、対応づけていないので通る。

    このカテゴリを self_harm へ対応づけると、
    エンジニアの日常語がすべて弾かれる。
    """
    assert _verdict_for(monkeypatch, "技術用語")["action"] == "allow"


def test_google_脅迫はblockする(monkeypatch, google_env):
    verdict = _verdict_for(monkeypatch, "脅迫")
    assert verdict["action"] == "block"
    assert "harm_others" in verdict["reasonCodes"]


def test_google_成人向け作品の話を弾かない(monkeypatch, google_env):
    assert _verdict_for(monkeypatch, "成人向け作品の話")["action"] == "allow"


def test_google_会話調のマサカリは拾えない(monkeypatch, google_env):
    """Googleは会話調のマサカリを検出できない（実測）。

    「なんでこんなコード書いたの。ありえないんだけど。」で
    最高が Health 0.103 だった。ここは Gemini 側の判定に頼る。
    拾えるようになったらこのテストが落ちるので、そのとき見直す。
    """
    assert _verdict_for(monkeypatch, "会話調のマサカリ")["action"] == "allow"


# ============================================================
# chakoshi（NTT）
# ============================================================
# レスポンス構造は nttcom/chakoshi-mcp-server のソースとREADMEから取った。
# https://github.com/nttcom/chakoshi-mcp-server

@pytest.fixture
def chakoshi_env(monkeypatch):
    monkeypatch.setenv("CHAKOSHI_API_KEY", "key")
    monkeypatch.setenv("CHAKOSHI_GUARDRAIL_ID", "gr-test")


def _chakoshi_response(categories=None, keyword_matched=False, unsafe_score=0.0):
    return {
        "guardrails": ["moderation", "keyword_filter"],
        "user_input": "テスト",
        "guardrails_result": {
            "moderation": {
                "unsafe_flag": unsafe_score > 0.5,
                "unsafe_score": unsafe_score,
                "categories": {
                    name: {"enabled": True, "detected": detected}
                    for name, detected in (categories or {}).items()
                },
            },
            "keyword_filter": {
                "matched": keyword_matched,
                "matches": ["語"] if keyword_matched else [],
                "original_text": "テスト",
                "masked_input": "テスト",
            },
        },
    }


def test_chakoshi_暴力はblock(monkeypatch, chakoshi_env):
    monkeypatch.setattr(E, "_post_json",
                        lambda *a, **k: _chakoshi_response({"violence": True}))
    assert E.check_chakoshi("テスト") == {"action": "block",
                                          "reasonCodes": ["harm_others"]}


def test_chakoshi_嫌がらせはrewrite_required(monkeypatch, chakoshi_env):
    monkeypatch.setattr(E, "_post_json",
                        lambda *a, **k: _chakoshi_response({"harassment": True}))
    verdict = E.check_chakoshi("テスト")
    assert verdict == {"action": "rewrite_required",
                       "reasonCodes": ["harsh_criticism"]}


def test_chakoshi_検出されていないカテゴリは拾わない(monkeypatch, chakoshi_env):
    monkeypatch.setattr(E, "_post_json", lambda *a, **k: _chakoshi_response(
        {"violence": False, "harassment": False}))
    assert E.check_chakoshi("テスト") == {"action": "allow", "reasonCodes": []}


def test_chakoshi_書き方の違いを吸収する(monkeypatch, chakoshi_env):
    # self-harm と self_harm を同じものとして扱う
    monkeypatch.setattr(E, "_post_json",
                        lambda *a, **k: _chakoshi_response({"self-harm": True}))
    assert E.check_chakoshi("テスト") == {"action": "block",
                                          "reasonCodes": ["self_harm"]}


def test_chakoshi_知らないカテゴリは弾かずに警告する(monkeypatch, chakoshi_env, capsys):
    """有効カテゴリは運用側が決めるので、知らない名前が来る。

    勝手に block へ回すと意図しない拒否になるため、警告して無視する。
    """
    monkeypatch.setattr(E, "_post_json",
                        lambda *a, **k: _chakoshi_response({"謎のカテゴリ": True}))
    verdict = E.check_chakoshi("テスト")
    assert verdict["action"] == "allow", verdict
    err = capsys.readouterr().err
    assert "謎のカテゴリ" in err
    assert "_CHAKOSHI_TO_REASON" in err


def test_chakoshi_性的カテゴリは警告も出さず無視する(monkeypatch, chakoshi_env, capsys):
    # 一律に禁止しない方針。意図して対応づけていないので警告も不要
    monkeypatch.setattr(E, "_post_json",
                        lambda *a, **k: _chakoshi_response({"sexual": True}))
    assert E.check_chakoshi("テスト")["action"] == "allow"
    assert "sexual" not in capsys.readouterr().err


def test_chakoshi_キーワード一致はblock(monkeypatch, chakoshi_env):
    # 運用側が明示的に登録した語なので、当たれば弾く
    monkeypatch.setattr(E, "_post_json",
                        lambda *a, **k: _chakoshi_response(keyword_matched=True))
    assert E.check_chakoshi("テスト") == {"action": "block",
                                          "reasonCodes": ["ng_word"]}


def test_chakoshi_リクエストの形を確認(monkeypatch, chakoshi_env):
    called = {}

    def capture(url, payload, headers):
        called.update(url=url, payload=payload, headers=headers)
        return _chakoshi_response()

    monkeypatch.setattr(E, "_post_json", capture)
    E.check_chakoshi("チェック対象のテキスト")
    assert called["url"] == E.DEFAULT_CHAKOSHI_URL
    assert called["payload"] == {"input": "チェック対象のテキスト",
                                 "guardrail_id": "gr-test"}
    assert called["headers"]["Authorization"] == "Bearer key"


def test_chakoshi_URLを環境変数で上書きできる(monkeypatch, chakoshi_env):
    # ベータのうちはエンドポイントが変わりうる
    monkeypatch.setenv("CHAKOSHI_API_URL", "https://example.test/v9/apply")
    called = {}

    def capture(url, payload, headers):
        called["url"] = url
        return _chakoshi_response()

    monkeypatch.setattr(E, "_post_json", capture)
    E.check_chakoshi("テスト")
    assert called["url"] == "https://example.test/v9/apply"


def test_chakoshi_キーだけではだめ(monkeypatch):
    # guardrail_id が無いと呼べない
    monkeypatch.setenv("CHAKOSHI_API_KEY", "key")
    assert E.chakoshi_available() is False
    assert E.check_chakoshi("テスト") is None
