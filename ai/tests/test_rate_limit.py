"""レート制限（429）の待機を確かめる。

実際には待たせず、time.sleep を差し替えて「何秒待つつもりだったか」を見る。
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import transform_api as T


RATE_LIMIT = "429 RESOURCE_EXHAUSTED: quota exceeded"
DAILY_QUOTA = "429 RESOURCE_EXHAUSTED GenerateRequestsPerDayPerProject"


@pytest.fixture
def no_sleep(monkeypatch):
    """待った秒数を記録するだけで、実際には待たない。"""
    slept = []
    monkeypatch.setattr(T.time, "sleep", slept.append)
    return slept


def _always_fails(message):
    def call(*args, **kwargs):
        raise Exception(message)
    return call


def _fails_then_succeeds(times, message=RATE_LIMIT):
    state = {"n": 0}

    def call(*args, **kwargs):
        state["n"] += 1
        if state["n"] <= times:
            raise Exception(message)
        return "成功"
    return call


# ============================================================
# エラー文の判別
# ============================================================

def test_レート制限を見分ける():
    assert T.is_rate_limit(RATE_LIMIT)
    assert T.is_rate_limit("429 something")
    assert not T.is_rate_limit("500 INTERNAL error")


def test_1日あたりの上限を見分ける():
    assert T.is_daily_quota(DAILY_QUOTA)
    assert not T.is_daily_quota("429 GenerateRequestsPerMinutePerProject")


def test_APIが指定した待ち時間を読む():
    assert T.suggested_wait("quota exceeded, 'retryDelay': '31s'") == 31.0
    assert T.suggested_wait("429 with no delay") is None


# ============================================================
# 待機のふるまい
# ============================================================

def test_429のあと成功すれば結果を返す(monkeypatch, no_sleep):
    monkeypatch.setattr(T, "_call_api", _fails_then_succeeds(2))
    assert T.call_with_retry(None, "s", "c", on_wait=lambda *a: None) == "成功"
    assert no_sleep == [20.0, 40.0]  # 倍々になる


def test_APIが指定した秒数を優先する(monkeypatch, no_sleep):
    monkeypatch.setattr(
        T, "_call_api",
        _fails_then_succeeds(1, "429 RESOURCE_EXHAUSTED 'retryDelay': '7s'"))
    T.call_with_retry(None, "s", "c", on_wait=lambda *a: None)
    assert no_sleep == [7.0]


def test_1回あたりの待ち時間に上限がある(monkeypatch, no_sleep):
    monkeypatch.setattr(
        T, "_call_api",
        _fails_then_succeeds(1, "429 RESOURCE_EXHAUSTED 'retryDelay': '9999s'"))
    T.call_with_retry(None, "s", "c", on_wait=lambda *a: None)
    assert no_sleep == [T.MAX_WAIT_PER_ATTEMPT]


def test_無限には待たない(monkeypatch, no_sleep):
    monkeypatch.setattr(T, "_call_api", _always_fails(RATE_LIMIT))
    monkeypatch.setattr(T, "MAX_RETRY_ATTEMPTS", 4)
    with pytest.raises(RuntimeError, match="解除されませんでした"):
        T.call_with_retry(None, "s", "c", on_wait=lambda *a: None)
    assert len(no_sleep) == 3  # 最後の試行のあとは待たない


def test_合計時間の上限で打ち切る(monkeypatch, no_sleep):
    monkeypatch.setattr(T, "_call_api", _always_fails(RATE_LIMIT))
    monkeypatch.setattr(T, "MAX_TOTAL_WAIT_SECONDS", 30)
    with pytest.raises(RuntimeError, match="解除されませんでした"):
        T.call_with_retry(None, "s", "c", on_wait=lambda *a: None)
    assert sum(no_sleep) <= 30


def test_1日あたりの上限では待たずに止まる(monkeypatch, no_sleep):
    monkeypatch.setattr(T, "_call_api", _always_fails(DAILY_QUOTA))
    with pytest.raises(RuntimeError, match="1日あたりの利用上限"):
        T.call_with_retry(None, "s", "c", on_wait=lambda *a: None)
    assert no_sleep == []


def test_レート制限以外はそのまま投げ直す(monkeypatch, no_sleep):
    monkeypatch.setattr(T, "_call_api", _always_fails("500 INTERNAL error"))
    with pytest.raises(Exception, match="500 INTERNAL"):
        T.call_with_retry(None, "s", "c", on_wait=lambda *a: None)
    assert no_sleep == []


def test_待っていることを知らせる(monkeypatch, no_sleep):
    monkeypatch.setattr(T, "_call_api", _fails_then_succeeds(1))
    notices = []
    T.call_with_retry(None, "s", "c",
                      on_wait=lambda attempt, pause, total: notices.append((attempt, pause)))
    assert notices == [(1, 20.0)]


# ============================================================
# 呼び出し間隔
# ============================================================

def test_間隔が0なら待たない(monkeypatch, no_sleep):
    monkeypatch.setattr(T, "MIN_INTERVAL_SECONDS", 0.0)
    monkeypatch.setattr(T, "_call_api", lambda *a, **k: "成功")
    T.call_with_retry(None, "s", "c")
    assert no_sleep == []
