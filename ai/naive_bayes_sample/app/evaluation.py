"""固定テストセットで分類器と信頼度閾値を評価する。"""

from __future__ import annotations

from collections import defaultdict
from typing import Iterable

from .classifier import NaiveBayesClassifier
from .dataset_quality import LABELS


def _f1_scores(actual: list[str], predicted: list[str | None]) -> dict[str, float]:
    scores: dict[str, float] = {}
    for label in LABELS:
        true_positive = sum(a == label and p == label for a, p in zip(actual, predicted))
        false_positive = sum(a != label and p == label for a, p in zip(actual, predicted))
        false_negative = sum(a == label and p != label for a, p in zip(actual, predicted))
        precision = true_positive / (true_positive + false_positive) if true_positive + false_positive else 0.0
        recall = true_positive / (true_positive + false_negative) if true_positive + false_negative else 0.0
        scores[label] = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return scores


def score_fixed_set(classifier: NaiveBayesClassifier, records: Iterable[dict], threshold: float) -> dict:
    """固定セットを閾値付きで採点する。threshold は 0〜1 または 0〜100。"""
    if not 0 < threshold <= 100:
        raise ValueError("threshold は 0 より大きく 100 以下にしてください")
    cutoff = threshold * 100 if threshold <= 1 else threshold
    actual: list[str] = []
    predicted: list[str | None] = []
    for record in records:
        result = classifier.predict_with_confidence(str(record["text"]), cutoff)
        actual.append(str(record["label"]))
        predicted.append(str(result["predicted_class"]) if result["passes_threshold"] else None)
    f1 = _f1_scores(actual, predicted)
    accepted = sum(value is not None for value in predicted)
    correct = sum(a == p for a, p in zip(actual, predicted))
    return {
        "threshold": cutoff,
        "macro_f1": sum(f1.values()) / len(LABELS),
        "f1_by_label": f1,
        "coverage": accepted / len(actual) if actual else 0.0,
        "accepted_accuracy": correct / accepted if accepted else 0.0,
        "rejected": len(actual) - accepted,
    }


def select_threshold(classifier: NaiveBayesClassifier, records: Iterable[dict], candidates: Iterable[float] = (0.60, 0.70, 0.80, 0.90)) -> dict:
    """固定セット上で macro-F1 を最大化する候補閾値を選ぶ。"""
    rows = list(records)
    scores = [score_fixed_set(classifier, rows, candidate) for candidate in candidates]
    return max(scores, key=lambda score: (score["macro_f1"], score["coverage"]))
