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
from src.fallback.toddler_accent import apply_toddler_accent
from src.fallback.token_match import replace_by_token
from src.transform import transform


class ApplyToddlerAccentTest(unittest.TestCase):
    def test_rule1_t_row_plus_s_row_becomes_t_row(self) -> None:
        # 「た」の直後の「し」が「ち」に変わる（わたし→わたち）。
        self.assertEqual(apply_toddler_accent("わたし"), "あたち")

    def test_rule2_k_row_at_word_head_becomes_t_row(self) -> None:
        # 単語の先頭の「き」が「ち」に変わる（きのう→ちのう）。
        self.assertEqual(apply_toddler_accent("きのう"), "ちのう")

    def test_rule2_only_applies_to_the_head_of_each_word(self) -> None:
        # 単語の先頭以外の「か行」は変わらない（「かぼちゃ」の「ちゃ」等）。
        result = apply_toddler_accent("かぼちゃ")

        self.assertEqual(result, "たぼちゃ")

    def test_rule3_wa_and_wo_lose_their_consonant(self) -> None:
        self.assertEqual(apply_toddler_accent("わたし"), "あたち")  # わ→あ
        self.assertEqual(apply_toddler_accent("かばんを見た"), "たばんお見た")  # を→お

    def test_rule4_sa_becomes_sya(self) -> None:
        self.assertEqual(apply_toddler_accent("うさぎ"), "うしゃぎ")

    def test_katakana_is_left_untouched(self) -> None:
        # カタカナ語（外来語）は対象外。辞書のキー「セダン」「カレー」等を
        # 壊さないための挙動でもある。
        self.assertEqual(apply_toddler_accent("セダンとカレー"), "セダンとカレー")

    def test_kanji_is_left_untouched(self) -> None:
        self.assertEqual(apply_toddler_accent("私は疲れた"), "私は疲れた")


class LoadVariantDictionaryTest(unittest.TestCase):
    def test_flattens_the_two_level_subcategory_structure(self) -> None:
        dictionary = load_variant_dictionary("baby_daily_words.json")

        self.assertIn("ママ", dictionary)
        self.assertIn("犬", dictionary)

    def test_picks_the_same_variant_for_the_same_word_every_time(self) -> None:
        first = load_variant_dictionary("baby_daily_words.json")
        second = load_variant_dictionary("baby_daily_words.json")

        self.assertEqual(first["ママ"], second["ママ"])

    def test_registers_the_accented_form_of_a_key_as_an_alias(self) -> None:
        # 「うさぎ」は幼児語訛り（規則4）で「うしゃぎ」になる。辞書変換は
        # 訛り変換の後に行われるため、訛った形も同じ値で登録されている必要がある。
        dictionary = load_variant_dictionary("baby_daily_words.json")

        self.assertIn("うしゃぎ", dictionary)
        self.assertEqual(dictionary["うしゃぎ"], dictionary["うさぎ"])

    def test_excludes_keys_starting_with_underscore(self) -> None:
        dictionary = load_variant_dictionary("baby_daily_words.json")

        self.assertNotIn("_comment", dictionary)


class LoadFlatDictionaryTest(unittest.TestCase):
    def test_loads_a_one_to_one_dictionary(self) -> None:
        dictionary = load_flat_dictionary("harsh_word_softeners.json")

        self.assertEqual(dictionary["無能"], "まだ慣れていない")
        self.assertNotIn("_comment", dictionary)


class DictionaryConsistencyTest(unittest.TestCase):
    def test_daily_and_engineer_dictionaries_have_no_overlapping_keys(self) -> None:
        # baby_fallback.py はこの2つを1つの辞書へ統合してから最長一致させる
        # （短いキーが複合語の一部を先に食べてしまう問題を避けるため）。
        # 統合する前提が崩れないよう、キーの重複が無いことを固定しておく。
        daily = load_variant_dictionary("baby_daily_words.json")
        engineer = load_variant_dictionary("baby_engineer_words.json")

        self.assertEqual(set(daily) & set(engineer), set())


class ReplaceByTokenTest(unittest.TestCase):
    def test_replaces_a_noun_token_that_matches_the_dictionary(self) -> None:
        dictionary = {"書": "のかみ"}

        result = replace_by_token("仕様書を確認する。", dictionary)

        self.assertEqual(result, "仕様のかみを確認する。")

    def test_does_not_replace_a_verb_stem_with_the_same_surface_form(self) -> None:
        # 「書」を接尾辞として辞書に持っていても、動詞「書く」の活用形
        # （「書いた」の「書い」等）は「書」という1文字トークンにならないため
        # 誤って変換されない（token_match.py の docstring 参照）。
        dictionary = {"書": "のかみ"}

        result = replace_by_token("明日までに書いてください。", dictionary)

        self.assertEqual(result, "明日までに書いてください。")

    def test_does_not_replace_a_word_that_already_contains_the_key_as_one_token(
        self,
    ) -> None:
        # 「辞書」は1つの名詞トークンなので、「書」というキーとは一致しない。
        dictionary = {"書": "のかみ"}

        result = replace_by_token("辞書を引いた。", dictionary)

        self.assertEqual(result, "辞書を引いた。")


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
        # 助詞「を」は幼児語訛り（規則3）で「お」に変わる（意図した挙動）。
        self.assertEqual(to_baby_words("カツカレーを食べました。"), "まんまお食べたのー。")

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

    def test_a_compound_word_not_in_the_dictionary_is_assembled_from_parts(self) -> None:
        # 人間監督の指摘：「仕様書」を丸ごと1語で覚えるのではなく、「仕様」
        # 「書」のように部品を列挙すれば、辞書に無い似た構造の複合語にも
        # 対応できる。「仕様概要図」は辞書に登録していない新語だが、
        # 「仕様」（→おやくそく）と「図」（→のかみ）が部品辞書にあるので
        # 変換される。
        result = to_baby_words("仕様概要図を確認する。")

        self.assertIn("おやくそく", result)
        self.assertIn("のかみ", result)

    def test_compound_dictionary_entries_that_would_conflict_are_kept_whole(self) -> None:
        # 「基本設計書」は語根「設計」が『開発フロー』カテゴリの複合語
        # （「外部設計」「内部設計」等）と衝突するため、部品分解せず複合語
        # のまま辞書に残している。分解されて壊れていないことを確認する。
        result = to_baby_words("基本設計書をレビューした。")

        self.assertIn("おやくそくのかみ", result)

    def test_a_word_that_would_collide_with_a_daily_word_part_is_kept_whole(self) -> None:
        # 「手順書」は語根「手順」の先頭が日常語彙辞書の「手」（体の部位）と
        # 衝突するため、部品分解せず複合語のまま辞書に残している。
        result = to_baby_words("手順書を作った。")

        self.assertIn("おやくそくのかみ", result)
        self.assertNotIn("おてて", result)

    def test_toddler_accent_is_applied_before_dictionary_lookup(self) -> None:
        # 「うさぎさん」は訛り変換で「うしゃぎしゃん」になり、その「うしゃぎ」
        # 部分が辞書のエイリアス経由で「ぴょんぴょん」に変換される。「さん」
        # 部分は辞書に無いので訛った形「しゃん」のまま残る。
        result = to_baby_words("うさぎさんを見た。")

        self.assertIn("ぴょんぴょんしゃん", result)

    def test_toddler_accent_does_not_break_the_gokigen_ending_rule(self) -> None:
        # 「してください」に訛り変換を先にかけると正規表現の語尾ルールと
        # 一致しなくなるため、baby_fallback.py は語尾変換を先に確定させてから
        # 訛り変換をかける（回帰テスト）。
        result = to_baby_words("確認してください。")

        self.assertIn("ほしいのー", result)


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
