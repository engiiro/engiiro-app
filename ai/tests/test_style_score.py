"""赤ちゃん語・ママ語らしさの採点を確かめる。

人間監督の指示による扱い:
    100点        → allow
    100点未満    → rewrite_required
    問題のある語 → 度合いに関わらず block

**いちばん大事なのは、変換APIの出力が実際に100点を取れること。**
100点が出ないと、変換しても投稿できないことになる。
下の REAL_OUTPUTS は実APIで作った変換結果をそのまま入れてある。
項目を増やして100点が出なくなったら、ここが落ちる。
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import style_score as S
import transform_api as T


# ============================================================
# 実APIで作った変換結果。ここが100点にならなければ設計が間違っている
# ============================================================

REAL_OUTPUTS = {
    "baby": [
        "たしかめ ぜんぶ だめだったのー。どうしてか わかんないのー。おぎゃあ。",
        "まちがい でちゃったのー。なんで か しらべて みてねー。",
        "あしたまでに しりょう つくらないと なのー。どうしよう。",
        "React.js の ばーじょんで つまっちゃって、index.ts が こわれちゃったのー。うぅ。",
        "きょうは みんなで やくそくのかみ みてもらって、まだきまってないこと おかたづけしたのー。えへへ。",
        "みてもらったときに たくさん おはなし されちゃって、ぼくのこころ ぽきっと いおれそうなのー。ぐすん。",
        "ねむい のー。ぜんぜん がんばれないのー。ぐすん。",
        "どにちが きえちゃったのー。うぅ。",
    ],
    "mother": [
        "テストが全部落ちてしまっていて、原因が分からないのね。つらかったね 🍀",
        "エラーが発生しちゃったのね。原因を調べてもらえるかな 🍀",
        "明日までに資料を作らないといけないのね。大変だけど、無理しすぎないでね 🍀",
        "React.js のバージョンのところで詰まってしまって、index.ts が壊れちゃったのね。大変だったね (˘ω˘)",
        "今日はチームで仕様書をレビューして、未決事項を整理できたのね。お疲れ様 😊",
        "レビューでたくさん指摘を受けて、心が折れそうになってしまったのね。つらかったね (˘ω˘)",
        "眠くて、なかなか集中できないのね。少し休んでみてもいいのよ 🍀",
        "土日がなくなっちゃったのね。お疲れ様、本当によくがんばったね (˘ω˘)",
    ],
}


@pytest.mark.parametrize(
    "mode,text",
    [(mode, text) for mode, texts in REAL_OUTPUTS.items() for text in texts],
    ids=lambda v: v[:18] if isinstance(v, str) and len(v) > 4 else str(v),
)
def test_変換APIの出力は100点になる(mode, text):
    result = S.score(mode, text)
    assert result["score"] == 100, result["failed"]


# ============================================================
# 普通の日本語は100点にならないこと
# ============================================================

PLAIN = [
    "テストが全部落ちていて、原因が分からない。つらい。",
    "エラーが発生したので、原因を調査してください。",
    "今日はチームで仕様書をレビューし、未決事項を整理しました。",
    "眠い。集中できない。",
    "明日までに資料を作らないといけない。",
]


@pytest.mark.parametrize("text", PLAIN, ids=lambda t: t[:14])
@pytest.mark.parametrize("mode", ["baby", "mother"])
def test_普通の日本語は100点にならない(mode, text):
    assert S.score(mode, text)["score"] < 100


# ============================================================
# 項目ごとの動き
# ============================================================

@pytest.mark.parametrize("text,failed", [
    ("たしかめ だめだったのー。", []),
    ("今日は だめだったのー。", ["kana"]),            # 漢字がある。カタカナは減点しない
    ("たしかめ だめでした。", ["ending", "polite"]),   # 敬語で、語尾が幼くない
    ("わたしは ねむいのー。", ["first_person"]),       # 大人の一人称
    ("おれは ねむいのー。", ["first_person"]),
])
def test_赤ちゃんの項目(text, failed):
    assert S.score("baby", text)["failed"] == failed


@pytest.mark.parametrize("text,failed", [
    ("つらかったね (˘ω˘)", []),
    ("つらかったね", ["emoji"]),
    ("これはバグだ。🍀", ["ending", "blunt"]),
    ("原因を調べろ。🍀", ["ending", "command"]),
])
def test_お母さんの項目(text, failed):
    assert S.score("mother", text)["failed"] == failed


def test_ぼくは大人の一人称ではない():
    """赤ちゃんの一人称なので減点しない。"""
    assert S.score("baby", "ぼくは ねむいのー。")["score"] == 100


def test_おれを含む語を一人称と取り違えない():
    """「いおれそう」「たおれそう」の中の「おれ」を拾ってはいけない。

    実APIの変換結果で実際に起きた誤検出。
    """
    assert S.score("baby", "こころが ぽきっと いおれそうなのー。")["score"] == 100
    assert S.score("baby", "たおれそうなのー。")["score"] == 100


def test_文末の絵文字で語尾の判定が外れない():
    """「つらかったね (˘ω˘)」の語尾は「ね」であって「)」ではない。"""
    assert "ending" not in S.score("mother", "つらかったね (˘ω˘)")["failed"]
    assert "ending" not in S.score("mother", "そうだったのね 😊")["failed"]


def test_点数は項目の割合():
    result = S.score("baby", "テストが だめでした。")
    passed = sum(result["checks"].values())
    assert result["score"] == round(passed * 100 / len(result["checks"]))


def test_満点なら失敗項目は空():
    result = S.score("baby", "ねむいのー。")
    assert result["score"] == 100
    assert result["failed"] == []
    assert all(result["checks"].values())


def test_おかしなmodeはValueError():
    with pytest.raises(ValueError):
        S.score("papa", "テスト")


def test_空文字列はValueError():
    for bad in ("", "   ", "\n"):
        with pytest.raises(ValueError):
            S.score("baby", bad)


def test_失敗項目を人が読める説明にできる():
    labels = S.describe("baby", ["kana", "polite"])
    assert len(labels) == 2
    assert all(isinstance(text, str) and text for text in labels)


# ============================================================
# 判定APIへの組み込み
# ============================================================

def test_100点ならallow(no_network_score):
    result = T.moderate("ねむいのー。", "baby")
    assert result["score"] == 100
    assert result["action"] == "allow"
    assert result["reasonCodes"] == []


def test_100点未満ならrewrite_required(no_network_score):
    result = T.moderate("テストが全部落ちた。つらい。", "baby")
    assert result["score"] < 100
    assert result["action"] == "rewrite_required"
    assert result["reasonCodes"] == ["style_mismatch"]


def test_問題のある語があれば点数に関わらずblock(no_network_score):
    """人間監督の決定：「問題のある言葉を使っていたら度合いに関わらずBlock」"""
    result = T.moderate("まったく カスなのー。", "baby")
    assert result["score"] == 100, "赤ちゃん語としては満点でも"
    assert result["action"] == "block"
    assert result["reasonCodes"] == ["harsh_criticism"]


def test_満点の自傷でもblock(no_network_score):
    result = T.moderate("きえたいのー。", "baby")
    assert result["action"] == "block"
    assert "self_harm" in result["reasonCodes"]


def test_modeを渡さなければ採点しない(no_network_score):
    result = T.moderate("テストが全部落ちた。つらい。")
    assert result["score"] is None
    assert result["styleChecks"] is None
    assert result["action"] == "allow", "採点しなければ問題のある語だけを見る"


def test_採点しても通信しない(no_network_score):
    for mode in ("baby", "mother"):
        T.moderate("テストです。", mode)


def test_おかしなmodeは判定APIでもValueError():
    with pytest.raises(ValueError):
        T.moderate("テストです。", "papa")


def test_項目ごとの合否も返す(no_network_score):
    result = T.moderate("テストが全部落ちた。つらい。", "baby")
    assert set(result["styleChecks"]) == {key for key, _, _ in S.BABY_CHECKS}


@pytest.fixture
def no_network_score(monkeypatch):
    """採点の経路で通信したら落ちるようにする。"""
    def boom(*args, **kwargs):
        raise AssertionError("通信しないはずの経路でAPIを呼びました")

    monkeypatch.setattr(T, "_call_api", boom)
    monkeypatch.setattr(T, "build_client", boom)
    monkeypatch.setattr(T.external_moderation, "check", boom)
