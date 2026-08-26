"""辞書へ入れる語の候補を、手元のLLMで探す。

**開発時の道具である。** 判定APIはこれを使わない。

規則（形態素解析＋辞書）では、語単位で表れないマサカリを拾えない。

    「なんでこんなコード書いたの。ありえないんだけど。」  →  素通り

埋め方は辞書を育てることだが、**問題のある言い回しを人手で思いつくのは大変**である。
そこで手元のLLMに大量の文を見せて、辞書へ入れる語の候補を出させる。
手元で動くので、外部APIの利用回数を気にせず何万件でも流せる。

## 使い方

    ollama pull qwen3:4b
    python ai/dictionaries/harvest.py --file candidates.txt

`candidates.txt` は1行1文。空行と # で始まる行は飛ばす。

## 出す前に落としているもの

**LLMが挙げた語をそのまま辞書へ入れてはいけない。** 4段構えで絞っている。

  1. すでに辞書にある語 … 捨てる
  2. **README.md の「入れてはいけない語」** … 捨てる。
     人間が実測して「日常語と区別できない」と判断したものなので、
     他の検査を通っても提案しない
  3. **通すべき文（tests/patterns.py の ALLOW）を弾く語** … 捨てる。
     あわせて、**元の文を実際に弾けること**も条件にしている。
     これが無いと、何にも当たらない照合方法を「安全」と判定してしまう
     （「死ぬ」に品詞「名詞」を当てると一度も当たらないので安全に見える）
  4. **その語の普通の使い方が見つかったもの** … 保留にして人へ見せる

## どの辞書へ入れるかを決められないもの

理由コードから追記先が一つに決まらない語は、**保留にして人へ返す。**
`personal_data` と `sexual_explicit` には対応する辞書が無く、
`judge()` は理由コードが空でも語を挙げてくることがあるためである。

同じ語が別の文でも挙がり、そこで分類が食い違った場合も保留へ上げる。
**先に見つけたほうで決め打たない。** そうしないと、結果が文の並び順で変わる。

決められないものを `rewrite.txt`（マサカリ）へ流すと、
その語は本番で `harsh_criticism` として弾かれる。**理由コードが変わると、
弾いたあと利用者へ見せる文言まで変わる。** 個人情報の語で
マサカリの文言を出すことになるので、黙って一番近い辞書へ入れてはいけない。

4を捨てずに保留にしているのは、無害かどうかの判定が当てにならないためである。
「ポンコツ」の例文に「彼のポンコツな考え方は理解されにくい」が挙がり、
これを無害と判定してしまった（実測）。捨てると良い候補まで消える。

3だけでは足りないことも実測で分かっている。「ゴミみたいなコードだ」から
**「コード」が候補に出た。** 通すべき文の集合に「コード」を含む文が
無かったためである。辞書へ入れれば技術の話が全部弾かれる。4はこれを拾う。

それでも**最後は人が見ること。** ここが出すのは候補であって、決定ではない。

## 速さ

GPUが無いと1件あたり5〜6秒かかる。保留の判定でさらに例文を出すので、
候補1件につき25秒ほど増える。**待つ前提で流しっぱなしにする道具**である。
外部APIと違って利用回数の制限が無いので、何万件でも流せる。
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

AI_DIR = Path(__file__).resolve().parent.parent
for _path in (str(AI_DIR), str(AI_DIR / "tests")):
    if _path not in sys.path:
        sys.path.insert(0, _path)

import local_llm
import moderation_rules as rules

# 理由コードと、追記先の辞書ファイルの対応。
#
# **personal_data と sexual_explicit はここに無い。**
# 個人情報は辞書ではなく規則（find_personal_data）で見るものであり、
# 性的表現に至っては辞書が無い。手元のLLMはこの2つも返してくるので、
# 対応先が無いことを _pick_dictionary が見て保留にする。
CODE_TO_DICTIONARY = {
    "ng_word": "block",
    "harsh_criticism": "rewrite",
    "self_harm": "self_harm",
    "harm_others": "harm_others",
}

# 照合方法の候補。安全なほうから順に試す。
# substring は取りこぼしが少ないが誤検出も多い。token、名詞の順に厳しくなる。
RULE_CANDIDATES = ("substring", "token", "名詞")

# **絶対に提案しない語。** README.md の「入れてはいけない語」と同じ。
# 人間が実測したうえで「区別できない」と判断したものなので、
# 通すべき文の集合を通過しても提案してはいけない。
#
# 通すべき文だけを頼りにすると、集合に無い言い回し
# （「釘を刺す」「壁を殴る」）を巻き込む語を通してしまう。実測で確認した。
NEVER_SUGGEST = {
    "ゴミ", "ごみ", "アホ", "あほ",
    "死ぬ", "死ん", "しぬ",
    "刺す", "刺し", "さす",
    "殴る", "殴っ", "なぐる",
    "落ちる", "落ち", "おちる",
    "詰む", "詰ん", "つむ",
    "カス", "かす",
}


def load_must_pass() -> list[str]:
    """通すべき文を読む。候補がこれを弾かないかを確かめるために使う。"""
    import patterns

    return list(patterns.ALLOW)


def known_words() -> set[str]:
    """すでに辞書にある語。"""
    words: set[str] = set()
    for name in CODE_TO_DICTIONARY.values():
        words |= set(rules.load_dictionary(name))
    return words


def _breaks_must_pass(word: str, rule_name: str, must_pass: list[str]) -> str | None:
    """その語をその照合方法で入れたとき、通すべき文を弾かないか。

    弾く文が1つでもあれば、その文を返す。無ければ None。
    """
    rule = rules._RULE_NAMES.get(rule_name, rule_name)
    table = {word: rule}
    for sentence in must_pass:
        if rules.match_ng_words(sentence, table, fallback_to_substring=True):
            return sentence
    return None


def _catches(word: str, rule_name: str, sentence: str) -> bool:
    """その語をその照合方法で入れたとき、元の文を実際に弾けるか。"""
    rule = rules._RULE_NAMES.get(rule_name, rule_name)
    return bool(rules.match_ng_words(sentence, {word: rule},
                                     fallback_to_substring=True))


def suggest_rule(word: str, must_pass: list[str],
                 found_in: str | None = None) -> tuple[str, str] | None:
    """通すべき文を壊さない照合方法を選ぶ。見つからなければ None。

    found_in を渡すと、**その文を実際に弾けることも条件にする。**
    これが無いと、何にも当たらない照合方法を「安全」と判定してしまう。
    「死ぬ」に品詞「名詞」を当てると、死ぬは常に動詞なので一度も当たらず、
    通すべき文も弾かないため安全に見える。実際はただ効かないだけである（実測）。

    Returns:
        (照合方法, 選んだ理由) または None
    """
    if word in NEVER_SUGGEST:
        return None

    for rule_name in RULE_CANDIDATES:
        if found_in is not None and not _catches(word, rule_name, found_in):
            continue
        broken = _breaks_must_pass(word, rule_name, must_pass)
        if broken is None:
            return rule_name, f"{rule_name} なら通すべき文を弾かない"
    return None


def innocent_uses(word: str) -> list[str]:
    """その語の「普通の使い方」の例文を集める。

    通すべき文の集合（124件）は、あらゆる語の無害な使い方を網羅できない。
    実際「ゴミみたいなコードだ」から**「コード」が候補に出た**。
    集合に「コード」を含む文が無かったためである。
    辞書へ入れれば技術の話が全部弾かれる（実測で確認）。

    そこで語ごとに例文を出してもらい、集合へ足す。
    **例文が無害かどうかは、自分の判定にかけて決める。**
    モデルに「普通の意味でも使うか」を聞いても当てにならない。
    「ポンコツ」「低能」にも「使う」と答え、挙がる例文は罵倒のままだった（実測）。
    """
    innocent = []
    for example in local_llm.usage_examples(word):
        # すでに規則で弾ける例文は、無害な使い方ではない
        if rules.check_rules(example)["action"] == "block":
            continue
        verdict = local_llm.judge(example)
        if verdict and verdict["action"] == "allow":
            innocent.append(example)
    return innocent


def harvest(sentences: list[str], limit: int | None = None) -> list[dict]:
    """文を1件ずつ見てもらい、辞書へ入れられそうな語を集める。

    Returns:
        [{"word", "dictionary", "rule", "reason", "found_in"}]
    """
    must_pass = load_must_pass()
    already = known_words()

    found: dict[str, dict] = {}
    for index, sentence in enumerate(sentences, 1):
        if limit and len(found) >= limit:
            break
        print(f"  [{index}/{len(sentences)}] {sentence[:36]}", file=sys.stderr, flush=True)

        # 規則ですでに弾けるものは、LLMに聞くまでもない
        if rules.check_rules(sentence)["action"] == "block":
            continue

        verdict = local_llm.judge(sentence)
        if not verdict or verdict["action"] != "block":
            continue

        dictionary, hold_reason = _pick_dictionary(verdict["reasonCodes"])
        for word in verdict["words"]:
            if word in already:
                continue
            if word in found:
                # 同じ語が別の文でも挙がった。分類が食い違えば保留へ上げる。
                # 最初の1回で決め打つと、後から分かった「決められない」を
                # 取りこぼす（実測ではなく、独立レビューの指摘で気づいた）。
                _merge_into(found[word], dictionary, hold_reason, sentence)
                continue
            suggestion = suggest_rule(word, must_pass, found_in=sentence)
            if suggestion is None:
                print(f"      捨てた: {word}（どの照合方法でも通すべき文を弾く）",
                      file=sys.stderr)
                continue
            rule_name, reason = suggestion

            if hold_reason:
                # 追記先が決まらないものは、この時点で人へ回す。
                # 例文集めは1語につき25秒かかるので、保留が決まっていれば省く。
                print(f"      保留: {word}（{hold_reason}）", file=sys.stderr)
                innocent = []
            else:
                # 通すべき文の集合は、あらゆる語の無害な使い方を網羅できない。
                # その語の普通の使い方を出してもらい、当たるなら保留にする。
                innocent = [
                    example for example in innocent_uses(word)
                    if _catches(word, rule_name, example)
                ]
                if innocent:
                    print(f"      保留: {word}（普通の使い方かもしれない）",
                          file=sys.stderr)

            found[word] = {
                "word": word,
                "dictionary": dictionary,
                "rule": rule_name,
                "reason": reason,
                "found_in": sentence,
                "innocent": innocent,
                "hold_reason": hold_reason,
            }
    return list(found.values())


def _pick_dictionary(codes: list[str]) -> tuple[str | None, str]:
    """理由コードから追記先を決める。決められなければ None と、その理由。

    **決められないものを rewrite.txt へ流してはいけない。**
    4つの辞書は「当たれば block」までは同じだが、理由コードが変わる。
    個人情報の語をマサカリ辞書へ入れると、利用者へ見せる文言まで変わる。

    決められないのは次の場合である。

      - 理由コードが空。judge() は words だけでも block を返すので起きる
      - personal_data / sexual_explicit のように、対応する辞書が無い
      - 理由コードが複数。どの語がどれに当たるかは、文からは決まらない

    Returns:
        (追記先, "") または (None, 決められない理由)
    """
    known = sorted({c for c in codes if c in CODE_TO_DICTIONARY})
    unknown = sorted({c for c in codes if c not in CODE_TO_DICTIONARY})

    if len(known) == 1 and not unknown:
        return CODE_TO_DICTIONARY[known[0]], ""
    if not known and not unknown:
        return None, "理由コードが無い"
    if not known:
        return None, "対応する辞書が無い: " + "/".join(unknown)
    return None, "理由コードが複数ある: " + "/".join(known + unknown)


def _merge_into(item: dict, dictionary: str | None, hold_reason: str,
                sentence: str) -> None:
    """すでに見つけている語に、別の文での判定を突き合わせる。

    **食い違ったら保留へ上げる。** 先に見つけたほうを採用して後を捨てると、
    後の文で分かった「決められない」が消えてしまう。
    保留が安全側なので、いったん上げたら下げない。
    こうすることで、結果が文の並び順に左右されなくなる。
    """
    if item.get("hold_reason"):
        return                                   # すでに保留。変わらない
    if not hold_reason and dictionary == item["dictionary"]:
        return                                   # 同じ結論

    if hold_reason:
        item["hold_reason"] = (
            f"別の文では決められなかった（{hold_reason}）: {sentence[:20]}"
        )
    else:
        item["hold_reason"] = (
            f"文によって追記先が違う（{item['dictionary']} と {dictionary}）: "
            f"{sentence[:20]}"
        )
    item["dictionary"] = None
    print(f"      保留へ変更: {item['word']}（{item['hold_reason']}）",
          file=sys.stderr)


def format_lines(candidates: list[dict]) -> str:
    """辞書へ貼れる形にする。3列目は人がレビューするための欄。

    次の2つは、**貼れる形にせず保留として分けて出す。**

      - 普通の使い方が見つかった語
      - 追記先の辞書が決まらなかった語

    前者を自動で捨てないのは、無害かどうかの判定が当てにならないためである。
    「ポンコツ」の例文に「彼のポンコツな考え方は理解されにくい」が挙がり、
    これを無害と判定してしまった（実測）。捨てると良い候補まで消える。
    """
    if not candidates:
        return "候補はありませんでした。"

    clean = [c for c in candidates
             if c.get("dictionary") and not c.get("innocent")]
    held = [c for c in candidates
            if not c.get("dictionary") or c.get("innocent")]

    blocks = []
    by_dictionary: dict[str, list[dict]] = {}
    for item in clean:
        by_dictionary.setdefault(item["dictionary"], []).append(item)

    for name, items in sorted(by_dictionary.items()):
        lines = [f"# --- {name}.txt へ ---"]
        for item in items:
            lines.append(
                f"{item['word']}\t{item['rule']}\t{item['reason']}"
                f"（出典: {item['found_in'][:24]}）"
            )
        blocks.append("\n".join(lines))

    if held:
        lines = [
            "# --- 保留。人が見て決めてください ---",
            "# 行頭が # なので、貼っても辞書には効きません。",
        ]
        for item in held:
            lines.append(
                f"# {item['word']}\t{item['rule']}\t"
                f"（出典: {item['found_in'][:20]}）"
            )
            if item.get("hold_reason"):
                lines.append(
                    f"#     どの辞書へ入れるか決められない: {item['hold_reason']}"
                )
            for example in item.get("innocent") or []:
                lines.append(f"#     この語をこう使うと弾く: {example}")
        blocks.append("\n".join(lines))

    return "\n\n".join(blocks) if blocks else "候補はありませんでした。"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="辞書へ入れる語の候補を、手元のLLMで探します。"
    )
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--file", type=argparse.FileType("r", encoding="utf-8"),
                        help="1行1文のテキストファイル。空行と # で始まる行は飛ばします。")
    source.add_argument("--text", help="1件だけ試す。")
    parser.add_argument("--limit", type=int, default=None,
                        help="候補がこの数に達したら止めます。")
    args = parser.parse_args()

    if not local_llm.available():
        print(local_llm.describe_setup(), file=sys.stderr)
        return 1

    if args.text:
        sentences = [args.text]
    else:
        with args.file as handle:
            sentences = [
                line.strip() for line in handle
                if line.strip() and not line.lstrip().startswith("#")
            ]

    if not sentences:
        print("読み込む文がありません。", file=sys.stderr)
        return 1

    candidates = harvest(sentences, limit=args.limit)
    print(file=sys.stderr)
    print(format_lines(candidates))
    print(file=sys.stderr)
    print(f"{len(sentences)}件を見て、候補 {len(candidates)}件。", file=sys.stderr)
    print("**そのまま貼らないこと。** 3列目の根拠を人が確かめてから追記してください。",
          file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
