"""推定年齢ベースラインの契約と、重要な順序関係を検証する。"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import pytest


AI_DIRECTORY = Path(__file__).resolve().parents[1]
if str(AI_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(AI_DIRECTORY))

from src.evaluate import evaluate  # noqa: E402


def test_baby_words_are_younger_than_adult_work_report() -> None:
    baby_text = evaluate("まんま ねんね", "baby")
    adult_text = evaluate("今日は仕様書をレビューしました", "baby")

    assert baby_text < adult_text


def test_baby_kana_and_childish_ending_are_younger_than_adult_text() -> None:
    childish_text = evaluate("ぼくね、きょうもいっぱいあそんだのー", "baby")
    adult_text = evaluate("本日は設計要件を確認し、検証結果を報告しました", "baby")

    assert childish_text < adult_text


def test_sentence_ending_score_does_not_depend_on_sentence_order() -> None:
    ending_first = evaluate("ねむいのー。おなかすいた。", "baby")
    ending_last = evaluate("おなかすいた。ねむいのー。", "baby")

    assert ending_first == ending_last


def test_mother_target_score_does_not_depend_on_sentence_order() -> None:
    child_first = evaluate("よしよし、できたね。今日はおやすみ。", "mother")
    child_last = evaluate("今日はおやすみ。よしよし、できたね。", "mother")

    assert child_first == child_last


def test_mother_language_for_small_child_is_younger_than_polite_encouragement() -> None:
    young_target = evaluate("よしよし、できたね", "mother")
    older_target = evaluate(
        "ご対応ありがとうございます。どうか無理なさらずお休みください。",
        "mother",
    )

    assert young_target < older_target


def test_baby_and_mother_use_different_axes() -> None:
    text = "よしよし、できたね"

    assert evaluate(text, "baby") != evaluate(text, "mother")


@pytest.mark.parametrize("persona_type", ["baby", "mother"])
def test_technical_fragments_alone_do_not_produce_extreme_age(
    persona_type: str,
) -> None:
    result = evaluate("React.js index.ts v2", persona_type)

    assert 0.5 < result < 5.5


@pytest.mark.parametrize("persona_type", ["baby", "mother"])
def test_technical_fragments_do_not_change_surrounding_language_score(
    persona_type: str,
) -> None:
    plain = evaluate("つらい", persona_type)
    with_technical_terms = evaluate("React.js index.ts v2 つらい", persona_type)

    assert with_technical_terms == plain


@pytest.mark.parametrize("persona_type", ["baby", "mother"])
def test_japanese_technical_topics_do_not_change_surrounding_language_score(
    persona_type: str,
) -> None:
    plain = evaluate("つらい", persona_type)
    with_technical_terms = evaluate(
        "仕様書レビュー実装設計検証要件業務原因対応報告資料つらい",
        persona_type,
    )

    assert with_technical_terms == plain


@pytest.mark.parametrize(
    "invisible", ["\u200b", "\ufeff", "\u202a", "\u202c", "\u2066", "\u2069"]
)
def test_invisible_format_characters_do_not_change_evaluation(invisible: str) -> None:
    assert evaluate(f"ねむい{invisible}のー", "baby") == evaluate("ねむいのー", "baby")


@pytest.mark.parametrize("persona_type", ["baby", "mother"])
def test_evaluation_is_deterministic(persona_type: str) -> None:
    text = "きょうはReact.jsの実装ができたよ"
    results = [evaluate(text, persona_type) for _ in range(10)]

    assert len(set(results)) == 1


@pytest.mark.parametrize(
    ("body", "persona_type"),
    [
        ("まんま", "baby"),
        ("仕様書を確認しました", "baby"),
        ("よしよし", "mother"),
        ("ご対応ありがとうございます", "mother"),
        ("React.js index.ts v2", "baby"),
    ],
)
def test_result_contract(body: str, persona_type: str) -> None:
    result = evaluate(body, persona_type)

    assert isinstance(result, float)
    assert math.isfinite(result)
    assert 0.0 <= result <= 6.0
    assert result == round(result, 1)


@pytest.mark.parametrize("body", ["", " ", "\t\n", "　"])
def test_blank_body_is_rejected(body: str) -> None:
    with pytest.raises(ValueError, match="body must not be blank"):
        evaluate(body, "baby")


@pytest.mark.parametrize("persona_type", ["", "Baby", "adult", None])
def test_unknown_persona_is_rejected(persona_type: str | None) -> None:
    with pytest.raises(ValueError, match="persona_type"):
        evaluate("こんにちは", persona_type)  # type: ignore[arg-type]


def test_non_string_body_is_rejected() -> None:
    with pytest.raises(TypeError, match="body must be a string"):
        evaluate(None, "baby")  # type: ignore[arg-type]
