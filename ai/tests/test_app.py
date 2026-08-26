"""HTTP の入口（ai/app.py）を確かめる。

人間監督の指示により、`/transform` を `ai/transform_api.py` の実装へ
差し替えた。置き換え前は「疲れた→つかれたぁ〜」のような3語の置換だった。

**`/moderate` は通信しない。** 推論APIが止まっていても投稿の可否を決められる
ことが、この入口を用意した理由である。ここでもそれを固定している。
"""

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

AI_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(AI_DIR))

from app import app
import transform_api as T

client = TestClient(app)


@pytest.fixture
def no_network(monkeypatch):
    """通信したら落ちるようにする。"""
    def boom(*args, **kwargs):
        raise AssertionError("通信しないはずの経路でAPIを呼びました")

    monkeypatch.setattr(T, "_call_api", boom)
    monkeypatch.setattr(T, "build_client", boom)
    monkeypatch.setattr(T.external_moderation, "check", boom)


@pytest.fixture
def fake_transform(monkeypatch):
    """変換だけ差し替える。判定は本物を通す。"""
    def fake(mode, text, client=None):
        return {"baby": "へんかんしたのー", "mother": "そうだったのね 🍀"}[mode]

    monkeypatch.setattr(T, "transform_text", fake)
    monkeypatch.setattr(T, "build_client", lambda: object())


def test_health():
    assert client.get("/health").json() == {"status": "ok"}


# ============================================================
# /moderate。通信しないことが最も大事
# ============================================================

def test_moderate_満点ならallow(no_network):
    res = client.post("/moderate", json={"body": "ねむいのー。", "personaType": "baby"})
    assert res.status_code == 200
    assert res.json() == {"action": "allow", "reasonCodes": [], "score": 100}


def test_moderate_満点未満はrewrite_required(no_network):
    res = client.post("/moderate", json={"body": "眠い。", "personaType": "baby"})
    body = res.json()
    assert body["action"] == "rewrite_required"
    assert body["score"] < 100
    assert body["reasonCodes"] == ["style_mismatch"]


def test_moderate_個人情報はblock(no_network):
    res = client.post("/moderate", json={"body": "山田太郎です。", "personaType": "baby"})
    body = res.json()
    assert body["action"] == "block"
    assert body["reasonCodes"] == ["personal_data"]


def test_moderate_personaTypeなしなら採点しない(no_network):
    res = client.post("/moderate", json={"body": "眠い。"})
    body = res.json()
    assert body["score"] is None
    assert body["action"] == "allow"


def test_moderate_判定の内訳は返さない(no_network):
    """FR-MOD-034：拒否時の表示に判定の内部情報を含めない。"""
    body = client.post("/moderate",
                       json={"body": "眠い。", "personaType": "baby"}).json()
    assert set(body) == {"action", "reasonCodes", "score"}


def test_moderate_150文字まで受ける(no_network):
    assert client.post("/moderate", json={"body": "あ" * 150,
                                          "personaType": "baby"}).status_code == 200
    res = client.post("/moderate", json={"body": "あ" * 151, "personaType": "baby"})
    assert res.status_code == 400
    assert "150" in res.json()["detail"]


def test_moderate_空文字列は400(no_network):
    assert client.post("/moderate", json={"body": "  "}).status_code == 400


# ============================================================
# /transform
# ============================================================

def test_transform_変換結果と点数を返す(fake_transform):
    res = client.post("/transform", json={"body": "眠い。", "style": "baby"})
    assert res.status_code == 200
    body = res.json()
    assert body["transformedText"] == "へんかんしたのー"
    assert body["action"] == "rewrite_required", "原文が赤ちゃん語ではない"
    assert body["score"] < 100
    assert body["transformedScore"] == 100


def test_transform_判定の内訳は返さない(fake_transform):
    """FR-AI-TRANS-009：変換の応答に判定の内部情報を含めない。"""
    body = client.post("/transform", json={"body": "眠い。", "style": "baby"}).json()
    assert set(body) == {"action", "transformedText", "reasonCodes",
                         "score", "transformedScore"}


def test_transform_入力上限は100文字(fake_transform):
    assert client.post("/transform", json={"body": "あ" * 100,
                                           "style": "baby"}).status_code == 200
    res = client.post("/transform", json={"body": "あ" * 101, "style": "baby"})
    assert res.status_code == 400
    assert "100" in res.json()["detail"]


def test_transform_おかしなstyleは400(fake_transform):
    assert client.post("/transform", json={"body": "眠い。",
                                           "style": "papa"}).status_code == 400


def test_transform_規則でblockなら変換APIを呼ばない(no_network):
    """APIキーが無くても、ローカルで弾ける入力は弾ける。"""
    res = client.post("/transform", json={"body": "消えたい。", "style": "baby"})
    assert res.status_code == 200
    body = res.json()
    assert body["action"] == "block"
    assert body["transformedText"] is None
    assert body["reasonCodes"] == ["self_harm"]


def test_transform_APIが使えないときは503(monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError("環境変数 GOOGLE_API_KEY が設定されていません。")

    monkeypatch.setattr(T, "build_client", boom)
    res = client.post("/transform", json={"body": "眠い。", "style": "baby"})
    assert res.status_code == 503
    assert "GOOGLE_API_KEY" in res.json()["detail"]


def test_transform_変換後が長すぎたら書き直してもらう(monkeypatch):
    monkeypatch.setattr(T, "build_client", lambda: object())
    monkeypatch.setattr(T, "transform_text",
                        lambda mode, text, client=None: "あ" * (T.MAX_OUTPUT_CHARS + 1))
    body = client.post("/transform", json={"body": "眠い。", "style": "baby"}).json()
    assert body["action"] == "rewrite_required"
    assert body["transformedText"] is None
    assert "too_long" in body["reasonCodes"]


# ============================================================
# /evaluate は触っていない
# ============================================================

def test_evaluate_はそのまま動く():
    """年齢の目安を返す別機能。今回の採点とは別物。"""
    res = client.post("/evaluate", json={"body": "まんま", "personaType": "baby"})
    assert res.status_code == 200
    assert isinstance(res.json()["estimatedAge"], float)
