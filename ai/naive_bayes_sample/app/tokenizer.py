"""
日本語のテキストを「単語のリスト」に分割するモジュール。

コンピュータは文章をそのままでは扱えない。機械学習でテキストを扱うときは、
まず文章を「単語」のような小さな単位（トークン）に分割してから、
それぞれの単語がどれくらい出現したかを数える、という手順を踏むのが一般的。
この処理を「トークナイズ（分かち書き）」と呼ぶ。

英語なら単語の間に半角スペースがあるので分割は簡単だが（"I am tired" → ["I", "am", "tired"]）、
日本語には単語の区切りが無いため（"ねむいよぉ" のどこが単語の切れ目か、機械には分からない）、
形態素解析という技術を使って単語に分割する必要がある。

ここでは fugashi（MeCab という有名な形態素解析エンジンの Python ラッパー）を使う。
fugashi は `pip install fugashi[unidic-lite]` だけで、辞書データも含めて
インストールが完結するので、別途 MeCab 本体をシステムにインストールする必要が無い。
"""

from __future__ import annotations

import re
import unicodedata

import fugashi

# fugashi.Tagger は形態素解析器の本体。
# 生成コストがそれなりにあるので、モジュールが読み込まれたときに一度だけ作り、
# 以降はこの1つを使い回す（関数を呼ぶたびに毎回 new すると遅くなる）。
_tagger = fugashi.Tagger()

# 記号・数字だけの単語は「赤ちゃんらしさ／お母さんらしさ」の手がかりにならないことが多い。
# ひらがな・カタカナ・漢字・英字のいずれかを1文字以上含む単語だけを残すためのパターン。
_HAS_LETTER_PATTERN = re.compile(
    r"[ぁ-んァ-ヶー一-龠a-zA-Z]"
)

# 判定前にだけ使う正規化。表示用の原文は変更しない。
_INVISIBLE = re.compile(r"[\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff\u00ad]")
_SEPARATOR = re.compile(r"[\s○●◯〇◎＊*✳✱×✕╳・･.,、。_＿\-－ー‐―~〜^]+")


def normalize_for_tokenization(text: str) -> str:
    """ゼロ幅文字や空白挿入で特徴量を分断されない判定用文字列を返す。"""
    if not isinstance(text, str):
        raise TypeError("text must be a string")
    normalized = unicodedata.normalize("NFKC", text)
    normalized = _INVISIBLE.sub("", normalized).lower()
    return _SEPARATOR.sub("", normalized)


def tokenize(text: str) -> list[str]:
    """
    文章を単語（トークン）のリストに分割する。

    例:
        tokenize("ばぶー ねむいよぉ")
        -> ["ばぶー", "ねむい", "よぉ"]  （実際の分割結果は辞書やテキストにより変わる）

    fugashi.Tagger(text) は文章全体を解析し、1つ1つの「形態素」（単語の最小単位）を
    表すオブジェクトのリストのようなものを返す。各要素の `.surface` が、
    実際にその単語が文章中でどう書かれていたか（表層形）を表す文字列。
    """
    normalized = normalize_for_tokenization(text)
    words = [morpheme.surface for morpheme in _tagger(normalized)]
    # 記号や数字だけのトークン（"。" "、" "!" など）は特徴として使わないので除外する。
    return [word for word in words if _HAS_LETTER_PATTERN.search(word)]


if __name__ == "__main__":
    # このファイルを直接実行した（`python app/tokenizer.py`）ときだけ動くコード。
    # 分かち書きの結果を目で見て確認するための、動作確認用のコード。
    samples = [
        "ばぶー ねむいよぉ、おしごとつかれたでちゅ",
        "よしよし、今日もよく頑張ったね。無理しないでゆっくり休んでね",
        "本日の定例会議は15時から会議室Aで行います。",
    ]
    for sample in samples:
        print(f"入力: {sample}")
        print(f"分割結果: {tokenize(sample)}")
        print()
