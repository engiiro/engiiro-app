"""AI文章変換（Gemini + ルールベースフォールバック）のテスト。

docs/ai_transform_design.md の実装（ai/src/transform.py、ai/src/fallback/、
ai/dictionaries/）を対象にする。Gemini APIは実際には呼ばず、
ai.transform_api.transform_text をモックに差し替える。
"""

from __future__ import annotations

import sys
import unittest
from concurrent.futures import TimeoutError as FutureTimeoutError
from pathlib import Path
from unittest.mock import patch

AI_DIRECTORY = Path(__file__).resolve().parents[1]
if str(AI_DIRECTORY) not in sys.path:
    # リポジトリのルートから実行しても、ai/ 配下のモジュールを import できるようにする。
    sys.path.insert(0, str(AI_DIRECTORY))

from src.fallback.baby_fallback import to_baby_words
from src.fallback.dictionary_loader import load_flat_dictionary, load_variant_dictionary
from src.fallback.dictionary_match import replace_longest_match
from src.fallback.mother_fallback import to_mother_words
from src.fallback.sentence_split import split_sentences
from src.transform import transform


class LoadVariantDictionaryTest(unittest.TestCase):
    def test_flattens_the_two_level_subcategory_structure(self) -> None:
        dictionary = load_variant_dictionary("baby_daily_words.json")

        self.assertIn("ママ", dictionary)
        self.assertIn("犬", dictionary)

    def test_picks_the_same_variant_for_the_same_word_every_time(self) -> None:
        first = load_variant_dictionary("baby_daily_words.json")
        second = load_variant_dictionary("baby_daily_words.json")

        self.assertEqual(first["ママ"], second["ママ"])

    def test_excludes_keys_starting_with_underscore(self) -> None:
        dictionary = load_variant_dictionary("baby_daily_words.json")

        self.assertNotIn("_comment", dictionary)


class LoadFlatDictionaryTest(unittest.TestCase):
    def test_loads_a_one_to_one_dictionary(self) -> None:
        dictionary = load_flat_dictionary("harsh_word_softeners.json")

        self.assertEqual(dictionary["無能"], "まだ慣れていない")
        self.assertNotIn("_comment", dictionary)


class ReplaceLongestMatchTest(unittest.TestCase):
    def test_prefers_the_longer_key_over_a_shorter_prefix(self) -> None:
        dictionary = {"自動車": "ブーブー", "車": "くるま"}

        result = replace_longest_match("自動車に乗る。", dictionary)

        self.assertEqual(result, "ブーブーに乗る。")

    def test_falls_back_to_the_shorter_key_when_the_longer_one_does_not_match(
        self,
    ) -> None:
        dictionary = {"自動車": "ブーブー", "車": "くるま"}

        result = replace_longest_match("車をとめた。", dictionary)

        self.assertEqual(result, "くるまをとめた。")

    def test_leaves_text_untouched_when_nothing_matches(self) -> None:
        dictionary = {"自動車": "ブーブー"}

        result = replace_longest_match("React.js のバグを直した。", dictionary)

        self.assertEqual(result, "React.js のバグを直した。")

    def test_empty_dictionary_returns_the_original_text(self) -> None:
        self.assertEqual(replace_longest_match("そのまま。", {}), "そのまま。")


class SplitSentencesTest(unittest.TestCase):
    def test_splits_on_sentence_terminators_and_keeps_them(self) -> None:
        result = split_sentences("今日は疲れました。エラーが発生した。")

        self.assertEqual(result, ["今日は疲れました。", "エラーが発生した。"])

    def test_a_single_sentence_without_terminator_is_kept_as_is(self) -> None:
        self.assertEqual(split_sentences("疲れた"), ["疲れた"])


class ToBabyWordsTest(unittest.TestCase):
    def test_converts_category_words(self) -> None:
        self.assertEqual(to_baby_words("カツカレーを食べました。"), "まんまを食べたのー。")

    def test_converts_engineer_words(self) -> None:
        result = to_baby_words("エラーが発生した。")

        self.assertIn("ばぐばぐ", result)

    def test_every_sentence_in_a_multi_sentence_input_gets_an_ending(self) -> None:
        # 語尾変換は文字列の末尾にしかかからないため、最初の文が変換されずに
        # 残ってしまう不具合を防ぐための回帰テスト。
        result = to_baby_words("今日は疲れました。確認してください。")

        self.assertNotIn("今日は疲れました。", result)  # 元の「です・ます」調が残っていない
        self.assertIn("ほしいのー", result)

    def test_adds_an_exclamation_prefix_when_a_feeling_word_is_present(self) -> None:
        result = to_baby_words("今日は疲れました。")

        self.assertTrue(result.startswith("ばぶー、") or result.startswith("おぎゃー、"))

    def test_does_not_add_an_exclamation_prefix_without_a_feeling_word(self) -> None:
        result = to_baby_words("レビューを依頼した。")

        self.assertFalse(result.startswith("ばぶー、"))
        self.assertFalse(result.startswith("おぎゃー、"))

    def test_replaces_first_person_pronouns(self) -> None:
        self.assertIn("わたち", to_baby_words("私は担当者です。"))

    def test_converts_a_word_with_multiple_variants_to_one_of_them(self) -> None:
        # 「ママ」には複数の赤ちゃん語バリエーション（まんま／ま／まー／まま）
        # があるため、そのうちのどれかに変換されることだけを確認する。
        result = to_baby_words("ママに会いたい。")

        self.assertTrue(any(variant in result for variant in ("まんま", "ま", "まー", "まま")))

    def test_converts_emergency_vehicles_differently_from_ordinary_cars(self) -> None:
        # 人間監督の指摘：救急車・パトカーは「ぶーぶー」ではなく「ぴーぽーぴーぽー」。
        result = to_baby_words("救急車とセダンが通った。")

        self.assertIn("ぴーぽーぴーぽー", result)
        self.assertIn("ぶーぶー", result)

    def test_verb_in_base_form_is_converted(self) -> None:
        self.assertIn("ねんね", to_baby_words("そろそろ寝る。"))

    def test_verb_in_conjugated_form_is_left_untouched(self) -> None:
        # 既知の制限：活用形（「寝た」）は辞書のキー（基本形「寝る」）と
        # 完全一致しないため変換されない。
        result = to_baby_words("昨日は早く寝た。")

        self.assertNotIn("ねんね", result)

    def test_unknown_technical_terms_are_left_untouched(self) -> None:
        result = to_baby_words("React.js のバージョンで詰まっている。")

        self.assertIn("React.js", result)


class ToMotherWordsTest(unittest.TestCase):
    def test_softens_a_command_into_a_request(self) -> None:
        result = to_mother_words("確認してください。")

        self.assertIn("してもらえるかな", result)

    def test_adds_a_prefix_and_a_suffix(self) -> None:
        result = to_mother_words("疲れた。")

        # 前置き・後置きの具体的な文言は6.7章の候補から機械的に選ばれるため、
        # 「何らかの前置きと後置きが付いている」ことだけを確認する。
        self.assertGreater(len(result), len("疲れた。"))

    def test_every_sentence_in_a_multi_sentence_input_gets_an_ending(self) -> None:
        result = to_mother_words("資料を作った。レビューしてください。")

        self.assertIn("してもらえるかな", result)


class TransformTest(unittest.TestCase):
    def test_blocks_before_calling_gemini_when_input_violates_rules(self) -> None:
        with patch("src.transform.transform_api.transform_text") as mock_transform_text:
            result = transform("死ね", "baby")

        mock_transform_text.assert_not_called()
        self.assertEqual(result["action"], "block")
        self.assertIsNone(result["transformedText"])
        self.assertIn("ng_word", result["reasonCodes"])

    def test_uses_the_gemini_result_when_the_call_succeeds(self) -> None:
        with patch(
            "src.transform.transform_api.transform_text",
            return_value="げみないでへんかんされたぶんしょう",
        ) as mock_transform_text:
            result = transform("普通の文章です。", "baby")

        mock_transform_text.assert_called_once()
        self.assertEqual(result["action"], "allow")
        self.assertEqual(result["transformedText"], "げみないでへんかんされたぶんしょう")

    def test_falls_back_to_the_rule_based_conversion_on_runtime_error(self) -> None:
        with patch(
            "src.transform.transform_api.transform_text",
            side_effect=RuntimeError("APIキー未設定"),
        ):
            result = transform("今日は疲れました。", "baby")

        self.assertEqual(result["action"], "allow")
        self.assertTrue(result["transformedText"].startswith(("ばぶー、", "おぎゃー、")))

    def test_falls_back_to_the_rule_based_conversion_on_timeout(self) -> None:
        with patch(
            "src.transform._call_gemini_with_timeout",
            side_effect=FutureTimeoutError(),
        ):
            result = transform("今日は疲れました。", "mother")

        self.assertEqual(result["action"], "allow")
        self.assertIn("よく頑張ったね", result["transformedText"])

    def test_blocks_when_the_fallback_output_still_violates_rules(self) -> None:
        # フォールバック変換の結果に対しても事後モデレーションを必ず通す
        # （辞書変換の結果が偶然NGワードと一致する可能性を排除できないため）。
        with (
            patch(
                "src.transform.transform_api.transform_text",
                side_effect=RuntimeError("APIキー未設定"),
            ),
            patch("src.transform._fallback_transform", return_value="死ね"),
        ):
            result = transform("なんでもない文章。", "baby")

        self.assertEqual(result["action"], "block")
        self.assertIsNone(result["transformedText"])

    def test_ng_word_softener_is_applied_before_conversion(self) -> None:
        with patch(
            "src.transform.transform_api.transform_text",
            side_effect=RuntimeError("APIキー未設定"),
        ):
            result = transform("あいつは無能だ。", "baby")

        self.assertEqual(result["action"], "allow")
        self.assertNotIn("無能", result["transformedText"])


if __name__ == "__main__":
    unittest.main()
