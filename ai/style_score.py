"""赤ちゃん語・ママ語にどれだけ近いかを点数にする。

判定API（transform_api.moderate）の一部。
**形態素解析と決まった語だけで動く。通信しない。**
仕様書の FR-AI-EVAL に対応する。

人間監督の決定による扱い:

    100点        → allow
    100点未満    → rewrite_required
    問題のある語 → 度合いに関わらず block

そのため「100点が取れること」が設計の前提になる。
点数は連続値ではなく、**いくつかの項目の合否の割合**にしてある。
全部満たせば100点になる。連続値にすると100点が事実上出ないため。

項目を増やすと1項目の重みが下がり、100点も遠くなる。
**増やすときは、変換APIの出力が実際に100点を取れるかを測ってから決めること。**
`ai/tests/test_style_score.py` に、実際の変換結果を入れてある。

赤ちゃんとお母さんで見るところは違う（仕様書 FR-AI-EVAL-002）。

    赤ちゃん … その文章自体が幼いか
    お母さん … 相手へ向けた言い方がやわらかいか
"""

from __future__ import annotations

import re

from moderation_rules import iter_tokens, tokenizer_available


# ============================================================
# 文字の種類
# ============================================================

_KANJI = re.compile(r"[一-鿿]")

# 絵文字。お母さんの文末に少しだけ添える約束になっている。
#
# **範囲を広げすぎないこと。** 矢印（←→⇒）やダインバット（✓✗➡）まで
# 入れると、「A → B の順で直したね」だけで絵文字ありと判定される。
# えんじいろの利用者はエンジニアなので、矢印は日常的に使う（実測で確認）。
_EMOJI = re.compile(
    "["
    "\U0001F300-\U0001FAFF"   # 絵文字の本体。😊 🌸 💛 🍀 はここ
    "☀-⛿"           # ☺ ☀ など。プロンプトが挙げている ☺️ を通すため
    "❤⭐✨"      # ❤ ⭐ ✨。よく使われるので個別に足す
    "]"
)

# (^^) (˘ω˘) (´ω｀) のような形。
#
# **括弧の中身に英数字・かな・漢字が入っていたら顔文字ではない。**
# この条件が無いと「そうだったのね (150文字)」「(FR-MOD-001)」まで
# 顔文字と判定される（実測で確認）。
# 代わりに (T_T) のような英字を使う顔文字は拾えなくなるが、
# 括弧書きを顔文字と誤認するほうが困るので、拾わないほうを選んだ。
_KAOMOJI = re.compile(r"[(（][^)）A-Za-z0-9ぁ-んァ-ヶ一-鿿０-９Ａ-Ｚａ-ｚ]{1,12}[)）]")


def _has_emoji(text: str) -> bool:
    """絵文字か顔文字が使われているか。"""
    return bool(_EMOJI.search(text) or _KAOMOJI.search(text))


def _strip_decoration(sentence: str) -> str:
    """文末に添えた絵文字・顔文字と空白を落とす。

    語尾を見る前に呼ぶ。「つらかったね (˘ω˘)」の語尾は「ね」であって
    「)」ではない。落とさないと語尾の判定が外れる（実測で確認）。
    """
    previous = None
    while previous != sentence:
        previous = sentence
        sentence = _KAOMOJI.sub("", sentence)
        sentence = _EMOJI.sub("", sentence)
        sentence = sentence.strip()
    return sentence


def _sentences(text: str) -> list[str]:
    """句点・改行で区切る。空の断片は捨てる。

    語尾を見るための区切りなので、飾りは落としてある。
    """
    parts = re.split(r"[。！？!?\n]+", text)
    return [s for s in (_strip_decoration(p) for p in parts) if s]


# ============================================================
# 赤ちゃん語の項目
# ============================================================

# 赤ちゃんらしい文末。どれか1つでも使われていればよい。
# 変換APIのプロンプトが指示している語尾に合わせてある。
BABY_ENDINGS = (
    "のー", "の", "なの", "なのー", "もん", "だもん",
    "ちゃった", "ちゃう", "ちゃって", "ないの", "たいの",
    "よー", "ねー", "たの", "るの",
)

# 赤ちゃんが使わない一人称。
#
# **部分一致で見てはいけない。** 「おれ」は「いおれそう」「たおれる」に、
# 「わたし」は「わたしたち」以外にも「みわたし」に含まれる。
# 名詞として1語で使われているときだけ数える。
ADULT_FIRST_PERSON = ("私", "僕", "俺", "自分", "わたし", "おれ", "ぼく", "小生", "当方")

# 赤ちゃんの一人称。これは使ってよい。
BABY_FIRST_PERSON = ("ぼく", "わたち", "ぼくちん")

# 敬語・ビジネス表現。原形で照合する。
POLITE_FORMS = ("ます", "です", "ございます", "でしょう", "ました", "ください")


def _baby_kana(text: str) -> bool:
    """漢字を使っていないこと。

    製品名・ファイル名・数値はそのまま残す約束だが、
    それらは英数字なのでこの検査には引っかからない。
    """
    return not _KANJI.search(text)


def _baby_ending(text: str) -> bool:
    """どこかの文の終わりが赤ちゃんらしいこと。

    文末すべてを見ないのは、「おぎゃあ。」「うぅ。」のような
    気持ちの声で終わる文が普通にあるためである。
    """
    return any(
        sentence.endswith(BABY_ENDINGS)
        for sentence in _sentences(text)
    )


def _baby_not_polite(text: str) -> bool:
    """敬語を使っていないこと。"""
    if not tokenizer_available():
        return not any(form in text for form in POLITE_FORMS)
    return not any(
        base in POLITE_FORMS
        for _surface, _pos, base in iter_tokens(text)
    )


def _baby_first_person(text: str) -> bool:
    """大人の一人称を使っていないこと。

    名詞として1語で使われているときだけ数える。部分一致では見ない。
    「ぽきっと いおれそう」の「おれ」を一人称と取り違えるためである（実測で確認）。
    """
    if not tokenizer_available():
        # 解析器が無いときは、他の語に埋もれない漢字表記だけ見る
        return not any(word in text for word in ("私", "僕", "俺"))

    adult = set(ADULT_FIRST_PERSON) - set(BABY_FIRST_PERSON)
    return not any(
        pos == "名詞" and (surface in adult or base in adult)
        for surface, pos, base in iter_tokens(text)
    )


BABY_CHECKS = (
    ("kana", "漢字を使っていない", _baby_kana),
    ("ending", "文の終わりが赤ちゃんらしい", _baby_ending),
    ("polite", "敬語を使っていない", _baby_not_polite),
    ("first_person", "大人の一人称を使っていない", _baby_first_person),
)


# ============================================================
# お母さん語の項目
# ============================================================

# 話しかける調子の語尾。
MOTHER_ENDINGS = (
    "ね", "のね", "かな", "のよ", "わね", "でね", "てね", "たね", "だね",
)

# 冷たい断定。文の終わりがこれなら、やわらかくない。
BLUNT_ENDINGS = ("だ", "である", "だろ", "しろ", "せよ", "やれ", "しなさい")


def _mother_ending(text: str) -> bool:
    """どこかの文の終わりが、話しかける調子であること。"""
    return any(
        sentence.endswith(MOTHER_ENDINGS)
        for sentence in _sentences(text)
    )


def _mother_not_blunt(text: str) -> bool:
    """冷たい断定や命令で終わっていないこと。"""
    return not any(
        sentence.endswith(BLUNT_ENDINGS)
        for sentence in _sentences(text)
    )


def _mother_not_command(text: str) -> bool:
    """命令形を使っていないこと。

    janome は活用形を返すので、そこを見る。
    解析器が無いときは、代表的な形だけを文字列で見る。
    """
    if not tokenizer_available():
        return not any(text.endswith(form) for form in BLUNT_ENDINGS)
    from moderation_rules import _tokenizer, normalize_for_tokenize

    return not any(
        "命令" in token.infl_form
        for token in _tokenizer.tokenize(normalize_for_tokenize(text))
    )


def _mother_emoji(text: str) -> bool:
    """絵文字か顔文字が添えてあること。"""
    return _has_emoji(text)


MOTHER_CHECKS = (
    ("ending", "話しかける調子の語尾がある", _mother_ending),
    ("blunt", "冷たい断定で終わっていない", _mother_not_blunt),
    ("command", "命令形を使っていない", _mother_not_command),
    ("emoji", "絵文字か顔文字が添えてある", _mother_emoji),
)


CHECKS = {"baby": BABY_CHECKS, "mother": MOTHER_CHECKS}


# ============================================================
# 採点
# ============================================================

def score(mode: str, text: str) -> dict:
    """赤ちゃん語・ママ語にどれだけ近いかを 0〜100 で返す。

    通信しない。

    Args:
        mode: "baby" または "mother"
        text: 判定したい文章

    Returns:
        {
          "score": 0〜100,
          "checks": {項目名: 満たしたか},
          "failed": [満たさなかった項目名],
        }

    Raises:
        ValueError: mode が違うか、text が空
    """
    if mode not in CHECKS:
        raise ValueError(f"mode は 'baby' または 'mother' です。指定: {mode}")
    if not text or not text.strip():
        raise ValueError("空文字列は採点できません。")

    checks = {key: bool(test(text)) for key, _label, test in CHECKS[mode]}
    passed = sum(checks.values())
    return {
        "score": round(passed * 100 / len(checks)),
        "checks": checks,
        "failed": [key for key, ok in checks.items() if not ok],
    }


def describe(mode: str, failed: list[str]) -> list[str]:
    """満たさなかった項目を、人が読める説明にする。

    利用者へそのまま見せてよいかは呼び出し側が決める。
    仕様書 FR-MOD-034 は、拒否時の表示に判定の内部情報を含めないよう求めている。
    """
    labels = {key: label for key, label, _ in CHECKS[mode]}
    return [labels[key] for key in failed if key in labels]
