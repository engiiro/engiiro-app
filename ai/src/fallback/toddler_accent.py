"""赤ちゃん語フォールバック用：幼児語訛り（舌足らず）の音韻変換。

docs/ai_transform_design.md 6.8章の実装。

人間監督の指定した4つの規則を、ひらがなの文字列に対して機械的に適用する。
ローマ字で言えば「子音＋母音」の組み合わせで表される音を対象にしており、
カタカナ・漢字・英数字はどの規則にも一致しないため、そのまま素通りする
（外来語の辞書キー「セダン」「カレー」等を壊さないための実利的な副産物）。

規則（人間監督の指定、ローマ字表記の () 内は例）：
    1. た行の直後にさ行が続くと、さ行がた行（同じ段）に変わる
       （watasi → watati、「わたし」→「わたち」）
    2. 単語の先頭がか行だと、た行に変わる（kinou → tinou、「きのう」→「ちのう」）
    3. わ・を は、子音が抜け落ちて母音だけになる（watasi → atasi、「わ」→「あ」）
    4. 「さ」は「しゃ」に変わる（usagisan → usagisyan、「さ」→「しゃ」）

適用順序は 2 → 1 → 3 → 4 にしている。規則2は形態素解析で単語の先頭を
判定する必要があるため、他の規則で文字列を変形する前に行う（変形後だと
単語境界の意味が変わってしまうため）。1・3・4 は原文に対する文字列走査だけで
完結するので、2の結果に対してそのまま適用できる。

**既存の辞書キーへの影響**：この変換は辞書変換より前、入力文全体に適用する
（人間監督の指定）。そのため、「うさぎ」→「うしゃぎ」のように、既存の
辞書キー自体が訛って辞書に一致しなくなることがある。影響を受けるキーは、
訛った後の形も辞書に別エントリとして追加してある
（`docs/ai_transform_design.md` 6.8章の一覧を参照）。
"""

from __future__ import annotations

import fugashi

_tagger = fugashi.Tagger()

# 規則2：単語の先頭のか行を、同じ段のた行へ。
_K_ROW_HEAD_TO_T: dict[str, str] = {
    "か": "た", "き": "ち", "く": "つ", "け": "て", "こ": "と",
}

# 規則1：た行の直後のさ行を、同じ段のた行へ。
_T_ROW = frozenset("たちつてと")
_S_ROW_TO_T: dict[str, str] = {
    "さ": "た", "し": "ち", "す": "つ", "せ": "て", "そ": "と",
}

# 規則3：わ行の子音を落として母音だけにする。
_WA_WO_TO_VOWEL: dict[str, str] = {"わ": "あ", "を": "お"}


def _apply_k_row_head_rule(text: str) -> str:
    """規則2：形態素解析で単語に区切り、各単語の先頭のか行をた行へ変える。"""
    result: list[str] = []
    for word in _tagger(text):
        surface = word.surface
        if surface and surface[0] in _K_ROW_HEAD_TO_T:
            surface = _K_ROW_HEAD_TO_T[surface[0]] + surface[1:]
        result.append(surface)
    return "".join(result)


def _apply_t_row_plus_s_row_rule(text: str) -> str:
    """規則1：た行の直後に続くさ行の文字だけを、同じ段のた行へ変える。"""
    chars = list(text)
    for i in range(len(chars) - 1):
        if chars[i] in _T_ROW and chars[i + 1] in _S_ROW_TO_T:
            chars[i + 1] = _S_ROW_TO_T[chars[i + 1]]
    return "".join(chars)


def _apply_wa_wo_rule(text: str) -> str:
    """規則3：わ・を の子音を落として母音だけにする。"""
    for kana, vowel in _WA_WO_TO_VOWEL.items():
        text = text.replace(kana, vowel)
    return text


def _apply_sa_rule(text: str) -> str:
    """規則4：「さ」を「しゃ」へ変える。"""
    return text.replace("さ", "しゃ")


def apply_toddler_accent(text: str) -> str:
    """幼児語訛り（舌足らず）の音韻変換を、4つの規則の順に適用する。"""
    text = _apply_k_row_head_rule(text)
    text = _apply_t_row_plus_s_row_rule(text)
    text = _apply_wa_wo_rule(text)
    text = _apply_sa_rule(text)
    return text


if __name__ == "__main__":
    samples = ["わたしはうさぎさんを見た。", "きのう、かぼちゃを買った。", "うさぎさんとお話しした。"]
    for sample in samples:
        print(f"入力: {sample}")
        print(f"出力: {apply_toddler_accent(sample)}")
        print()
