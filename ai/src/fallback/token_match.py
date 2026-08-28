"""形態素（トークン）単位での辞書置換。複合語を部品に分解して変換するために使う。

`dictionary_match.replace_longest_match()`は原文の文字列に対する最長一致で、
複合語全体を1つのキーとして登録する必要がある（例："仕様書"を丸ごと登録）。
これだと、辞書に登録していない新しい複合語（例："規約書"）には対応できない。

この関数は逆に、複合語を構成する部品（例："仕様"＋"書"）をそれぞれ辞書に
登録しておき、形態素解析でトークンに分けたうえで、トークンの表層形が辞書に
完全一致する場合だけ置換する。これにより、辞書に無い新しい組み合わせ
（例："規約"＋"書" → 「規約書」も辞書に"規約"さえあれば変換できる）にも
自動的に対応できる。

**品詞で動詞を除外する理由**：「書」を接尾辞として辞書に登録した場合、
動詞「書く」の活用形（書いた／書きます／書けば等）と衝突しないかが心配に
なる。実際にfugashiで確認すると、動詞「書く」の活用形は常に活用語尾を含む
2文字以上のトークンになり（「書い」「書き」「書け」等）、「書」という
1文字だけの独立トークンにはならない。一方「仕様書」の「書」は
`pos1 == "接尾辞"`の独立トークンとして分かれる。念のため、pos1が
「名詞」「接尾辞」のトークンだけを対象にし、動詞・助動詞・助詞等は除外する
（`docs/ai_transform_design.md` 6.4章参照）。
"""

from __future__ import annotations

import fugashi

_TARGET_POS1 = {"名詞", "接尾辞"}

_tagger = fugashi.Tagger()


def replace_by_token(text: str, dictionary: dict[str, str]) -> str:
    """`text`を形態素解析し、名詞・接尾辞のトークンで辞書に完全一致するものだけ置換する。"""
    if not dictionary:
        return text

    result: list[str] = []
    for word in _tagger(text):
        surface = word.surface
        if word.feature.pos1 in _TARGET_POS1 and surface in dictionary:
            result.append(dictionary[surface])
        else:
            result.append(surface)
    return "".join(result)


if __name__ == "__main__":
    sample_dictionary = {"仕様": "おやくそく", "書": "のかみ", "手順": "おやくそく"}
    samples = ["仕様書を確認する。", "手順書を作った。", "明日までに書いてください。", "辞書を引いた。"]
    for sample in samples:
        print(f"入力: {sample}")
        print(f"出力: {replace_by_token(sample, sample_dictionary)}")
        print()
