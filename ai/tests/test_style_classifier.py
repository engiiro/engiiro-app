"""style_classifier の分類・閾値判定を確かめる。

分類ロジック自体（ナイーブベイズ）とデータはengiiro/naive-bayes-sampleで
検証済み（300件合算90.0%）のため、ここでは「engiiro-appへ正しく配線されているか」
（学習データが読めるか、閾値判定の向きが正しいか）を確認する。
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.style_classifier import (
    CLASS_NAMES,
    THRESHOLD,
    get_classifier,
    load_training_data,
    passes_threshold,
)


def test_学習データが3クラスとも読み込める():
    dataset = load_training_data()
    assert set(dataset.keys()) == set(CLASS_NAMES)
    for class_name in CLASS_NAMES:
        # engiiro/naive-bayes-sample 由来のデータ(赤ちゃん3,855/お母さん3,869/その他3,801)。
        # 極端な減少は移行漏れを示すため、桁を落とさない程度の下限で検知する。
        assert len(dataset[class_name]) > 1000, class_name


def test_閾値は50():
    # 人間監督の決定(2026-08-27)。
    assert THRESHOLD == 50.0


def test_赤ちゃん言葉は赤ちゃんpersonaで通る():
    assert passes_threshold("ばぶー ねむいよぉ、おしごとつかれたでちゅ", "baby") is True


def test_お母さん言葉はお母さんpersonaで通る():
    text = "よしよし、今日もよく頑張ったね。無理しないでゆっくり休んでね"
    assert passes_threshold(text, "mother") is True


def test_業務文はどちらのpersonaでも通らない():
    text = "本日の定例会議は15時から会議室Aで行います。"
    assert passes_threshold(text, "baby") is False
    assert passes_threshold(text, "mother") is False


def test_未知のpersonaTypeはFalse():
    assert passes_threshold("ばぶー", "unknown") is False


def test_確率は3クラス合計で100になる():
    proba = get_classifier().predict_proba("ばぶー ねむいよぉ")
    assert set(proba.keys()) == set(CLASS_NAMES)
    assert round(sum(proba.values()), 1) == 100.0
