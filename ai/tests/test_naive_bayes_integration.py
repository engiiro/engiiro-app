"""1〜8の統合契約を確認する。"""

from __future__ import annotations

import json
import sys
from pathlib import Path

AI_ROOT = Path(__file__).resolve().parents[1]
if str(AI_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_ROOT))

from naive_bayes_sample.app.age_labels import load_age_labels  # noqa: E402
from naive_bayes_sample.app.classifier import NaiveBayesClassifier  # noqa: E402
from naive_bayes_sample.app.data_loader import load_training_data  # noqa: E402
from naive_bayes_sample.app.dataset_quality import (  # noqa: E402
    apply_replacements,
    duplicate_pairs,
    load_fixed_test_set,
    normalize_for_duplicate,
)
from naive_bayes_sample.app.evaluation import score_fixed_set, select_threshold  # noqa: E402


def _classifier() -> NaiveBayesClassifier:
    classifier = NaiveBayesClassifier()
    classifier.fit(load_training_data())
    return classifier


def test_fixed_set_has_all_labels_and_no_duplicates() -> None:
    path = AI_ROOT / "naive_bayes_sample" / "data" / "fixed_test.json"
    records = load_fixed_test_set(path)
    assert {record["label"] for record in records} == {"赤ちゃん", "お母さん", "その他"}
    assert duplicate_pairs(records) == []


def test_zero_width_and_inserted_spaces_normalize_equally() -> None:
    plain = normalize_for_duplicate("ばぶー、ねむいよぉ")
    disguised = normalize_for_duplicate("ば\u200bぶー ね むいよぉ")
    assert disguised == plain


def test_duplicate_replacement_must_be_explicit_and_unique() -> None:
    records = [{"label": "その他", "text": "同じ文章"}, {"label": "赤ちゃん", "text": "同じ文章"}]
    replacement = apply_replacements(records, {1: "ばぶー、別の文章だよ"})
    assert duplicate_pairs(replacement) == []


def test_fixed_set_score_and_threshold_are_reported() -> None:
    records = load_fixed_test_set(AI_ROOT / "naive_bayes_sample" / "data" / "fixed_test.json")
    score = score_fixed_set(_classifier(), records, 0.60)
    selected = select_threshold(_classifier(), records, (0.60, 0.80, 0.90))
    assert 0.0 <= score["macro_f1"] <= 1.0
    assert 0.0 <= selected["threshold"] <= 100.0
    assert "rejected" in selected


def test_age_labels_are_a_separate_optional_file(tmp_path: Path) -> None:
    path = tmp_path / "age.json"
    path.write_text(json.dumps([{"text": "例文", "age": 2}], ensure_ascii=False), encoding="utf-8")
    assert load_age_labels(path)[0]["age"] == 2
