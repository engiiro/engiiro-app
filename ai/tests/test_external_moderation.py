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
                 "AZURE_CONTENT_SAFETY_KEY"):
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
