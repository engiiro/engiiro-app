"""取り込んだ naive-bayes-sample の最小統合確認。"""

from __future__ import annotations

import sys
from pathlib import Path


AI_ROOT = Path(__file__).resolve().parents[1]
if str(AI_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_ROOT))

from naive_bayes_sample.app.classifier import NaiveBayesClassifier  # noqa: E402
from naive_bayes_sample.app.data_loader import load_training_data  # noqa: E402


def test_sample_data_has_three_classes() -> None:
    dataset = load_training_data()
    assert set(dataset) == {"赤ちゃん", "お母さん", "その他"}
    assert all(dataset[name] for name in dataset)


def test_classifier_returns_all_probabilities() -> None:
    dataset = load_training_data()
    classifier = NaiveBayesClassifier()
    classifier.fit(dataset)

    probabilities = classifier.predict_proba("ばぶー ねむいよぉ、おなかすいたでちゅ")

    assert set(probabilities) == {"赤ちゃん", "お母さん", "その他"}
    assert round(sum(probabilities.values()), 1) == 100.0
    assert classifier.predict("ばぶー ねむいよぉ、おなかすいたでちゅ") == "赤ちゃん"


def test_classifier_rejects_prediction_before_fit() -> None:
    classifier = NaiveBayesClassifier()

    try:
        classifier.predict_proba("こんにちは")
    except RuntimeError as error:
        assert "fit" in str(error)
    else:
        raise AssertionError("未学習の分類器が予測を受け付けました")
