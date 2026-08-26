"""テスト全体の下ごしらえ。

**連打の制限を毎テストで戻す。**

数えているのは1プロセス内なので、戻さないと前のテストの回数が
次のテストへ持ち越される。`/transform` の上限は6回/分なので、
7つ目のテストから 429 になって落ちた（実測で気づいた）。
"""

import sys
from pathlib import Path

import pytest

AI_DIR = Path(__file__).resolve().parent.parent
if str(AI_DIR) not in sys.path:
    sys.path.insert(0, str(AI_DIR))

import api_security


@pytest.fixture(autouse=True)
def _reset_rate_limits():
    """テストごとに、数えた回数を捨てる。"""
    api_security.transform_limiter.reset()
    api_security.local_limiter.reset()
    yield
