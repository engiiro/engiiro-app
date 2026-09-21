from naive_bayes_sample.app.moderation import find_abuse, is_abusive


def test_registered_abuse_is_detected_after_spacing_and_zero_width_insertion():
    assert is_abusive("無\u200b能")
    assert find_abuse("役 立 た ず") == ("役立たず",)


def test_non_abusive_text_is_not_blocked():
    assert not is_abusive("今日はレビューを丁寧に進めます")


def test_hiragana_katakana_and_masked_variants_are_detected():
    assert is_abusive("しね")
    assert is_abusive("シネ")
    assert is_abusive("こ○ろしてやる")


def test_common_words_are_not_false_positive():
    assert not is_abusive("今日はゴミ出しの日です")
    assert not is_abusive("カスタマーサポートへ問い合わせます")
