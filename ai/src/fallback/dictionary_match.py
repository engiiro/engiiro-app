"""辞書の最長一致による文字列置換。

docs/ai_transform_design.md 6.3章の実装。

「自動車」のような複合語は、形態素解析（fugashi/unidic-lite）にかけると
辞書の分割単位によっては「自動」+「車」のように2形態素へ分かれることがある。
形態素単位でそのまま辞書引きすると「自動車」を1語として拾えない。

この問題を、形態素解析を使わずに解決する。辞書のキー自体は既知の文字列
（「自動車」「セダン」等）なので、原文に対して**辞書のキーを文字数が長い順に
走査し、最初に見つかった位置から最長一致で置換する**。これなら、辞書に
「自動車」と「車」の両方が登録されていても、長い「自動車」が先に一致し、
「自動」+「車」のような部分一致による誤変換を避けられる。
"""

from __future__ import annotations


def replace_longest_match(text: str, dictionary: dict[str, str]) -> str:
    """`text`の中から`dictionary`のキーを最長一致で探し、対応する値へ置き換える。

    走査は文字列の先頭から1文字ずつ進める。各位置で、まだ長さ順に並べていない
    キー一覧を長い順に試し、その位置から始まる最長一致を採用する。
    一致しなければ元の文字を1文字だけ結果へ積んで次の位置へ進む。

    Args:
        text: 変換対象の原文。
        dictionary: 置換元の語をキー、置換後の語を値とする辞書。

    Returns:
        置換後の文字列。辞書に一致しない部分は元のまま残る。
    """
    if not dictionary:
        return text

    # 同じ長さのキーが複数あっても走査コストを増やさないよう、事前に長い順へ
    # ソートしておく。ループのたびに毎回ソートし直すと文章が長いほど遅くなる。
    keys_by_length_desc = sorted(dictionary, key=len, reverse=True)

    result: list[str] = []
    i = 0
    n = len(text)
    while i < n:
        matched_key = None
        for key in keys_by_length_desc:
            if not key:
                continue
            if text.startswith(key, i):
                matched_key = key
                break
        if matched_key is not None:
            result.append(dictionary[matched_key])
            i += len(matched_key)
        else:
            result.append(text[i])
            i += 1
    return "".join(result)


if __name__ == "__main__":
    # 「自動車」と「車」の両方を辞書に入れても、長い「自動車」が優先して
    # 一致することを確認する（「自動」+「くるま」のような分割崩れが起きない）。
    sample_dictionary = {"自動車": "ブーブー", "車": "くるま"}
    for sample_text in ("自動車を運転する。", "車をとめた。"):
        print(f"入力: {sample_text}")
        print(f"出力: {replace_longest_match(sample_text, sample_dictionary)}")
