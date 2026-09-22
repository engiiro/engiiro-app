"""文体（赤ちゃん語・ママ語らしさ）をナイーブベイズで学習する。

人間監督の決定により、**採点基準を人が決めない。**

    ラベルで大量に学習データを入れることでそれを判断にするのに、
    採点基準を決めてしまったらそれはよくない。
    お母さんが顔文字や絵文字が必ず必要とかが問題になる。

そこで「絵文字があれば何点」のような重みは一切書かない。
ラベル付きの文を読ませて、どの手がかりがどれだけ効くかは学習で決める。

## 2つに分かれている

    学習   scikit-learn の MultinomialNB を使う。開発時にだけ動かす
    判定   学習結果のJSONを読んで、**素のPythonだけ**で確率を出す

判定側で scikit-learn を使わないのは、判定APIを軽いままにするためである。
pickle も使わない。読み込みでコードが動く形式を判定の経路へ置きたくない。
同じ入力に対して両者が同じ値を出すことは、テストで固定してある。

## 特徴量は文字N-gram（2〜3文字）

**語に切らない。** 実測で、語に切ると成績が落ちた。

    語で学習        4/8 誤り
    文字N-gramで    1/8 誤り

日本語の形態素解析は新聞のような文章で作られているので、
「のー」を「の」＋「ー」に、「でちゅ」を「で」＋「ち」＋「ゅ」に割ってしまう。
**文体を学ばせたいのに、文体の手がかりが切る時点で壊れる。**
文字のまま渡せば「たのー」「んだもん」がそのまま特徴になる。

これは重みを決めているのではなく、**モデルに何を見せるか**の話である。
どの並びが効くかは学習が決める。

## 手がかりが無い文について

一致するN-gramが1つも無いと、確率は事前確率のまま返る。
短い文で起きる。**当てずっぽうを「予測」として扱わないよう、
一致した数を必ず返している。** 呼び出し側は matched を見ること。

## 使い方

    python ai/style_model.py --train
    python ai/style_model.py --text "ねむいのー。"
    python ai/style_model.py --cross-validate
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from collections import Counter
from pathlib import Path

AI_DIR = Path(__file__).resolve().parent
DATA_PATH = AI_DIR / "data" / "style_samples.tsv"
MODEL_PATH = AI_DIR / "models" / "style_model.json"

#: 文字N-gramの長さ。実測で決めた（説明は冒頭）
NGRAM_MIN = 2
NGRAM_MAX = 3

#: 学習データのラベル
PERSONAS = ("baby", "mother", "neither")

#: この数だけ一致しなければ「分からない」とみなす。
#: 0件だと事前確率がそのまま返るため、予測として扱ってはいけない。
MIN_MATCHED_FEATURES = 1

#: 一番高い確率がこれ未満なら、判断がついていないとみなす。
#: 3クラスなので、当てずっぽうは 0.33 付近になる。
CONFIDENT_THRESHOLD = 0.60

#: scikit-learn の CountVectorizer が内部で行う空白のたたみ込みと同じもの。
#: ここがずれると、学習と判定で違う特徴量になる。
_WHITESPACE = re.compile(r"\s\s+")


# ============================================================
# 特徴量
# ============================================================

def char_ngrams(text: str, low: int = NGRAM_MIN, high: int = NGRAM_MAX) -> list[str]:
    """文字N-gramへ分ける。

    scikit-learn の `CountVectorizer(analyzer="char")` と同じ結果になるよう、
    空白のたたみ込みまで合わせてある。**片方だけ変えないこと。**
    """
    document = _WHITESPACE.sub(" ", text)
    length = len(document)
    grams: list[str] = []
    for size in range(low, min(high, length) + 1):
        for start in range(length - size + 1):
            grams.append(document[start:start + size])
    return grams


# ============================================================
# 学習データ
# ============================================================

def load_samples(path: Path = DATA_PATH) -> list[dict]:
    """タブ区切りの学習データを読む。

    Returns:
        [{"text", "persona", "age"}]  age は分からなければ None
    """
    samples: list[dict] = []
    with path.open(encoding="utf-8") as handle:
        for number, line in enumerate(handle, 1):
            line = line.rstrip("\n")
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            columns = line.split("\t")
            if columns[0] == "text":          # 見出し行
                continue
            if len(columns) < 2:
                raise ValueError(f"{path.name} {number}行目: 列が足りません: {line!r}")

            text, persona = columns[0].strip(), columns[1].strip()
            if persona not in PERSONAS:
                raise ValueError(
                    f"{path.name} {number}行目: persona は {'/'.join(PERSONAS)} です: {persona!r}"
                )
            age_text = columns[2].strip() if len(columns) > 2 else ""
            samples.append({
                "text": text,
                "persona": persona,
                "age": int(age_text) if age_text else None,
            })
    return samples


# ============================================================
# 学習（開発時だけ。scikit-learn を使う）
# ============================================================

def train(samples: list[dict]) -> dict:
    """ナイーブベイズを学習し、判定に必要な数値だけを取り出す。

    **重みは書かない。** どのN-gramがどちらへ寄せるかは、ここで学習した値である。

    Returns:
        JSONへ落とせる辞書
    """
    from sklearn.feature_extraction.text import CountVectorizer
    from sklearn.naive_bayes import MultinomialNB

    if not samples:
        raise ValueError("学習データが空です。")

    vectorizer = CountVectorizer(
        analyzer="char",
        ngram_range=(NGRAM_MIN, NGRAM_MAX),
        lowercase=False,        # 日本語では効かず、判定側の再現が難しくなるだけ
    )
    features = vectorizer.fit_transform(s["text"] for s in samples)
    labels = [s["persona"] for s in samples]

    model = MultinomialNB()
    model.fit(features, labels)

    return {
        "version": 1,
        "ngram_range": [NGRAM_MIN, NGRAM_MAX],
        # numpy の文字列型のまま入れると JSON にも表示にも漏れるので戻す
        "classes": [str(name) for name in model.classes_],
        "class_log_prior": [round(v, 8) for v in model.class_log_prior_.tolist()],
        "vocabulary": {gram: int(index)
                       for gram, index in vectorizer.vocabulary_.items()},
        "feature_log_prob": [[round(v, 8) for v in row]
                             for row in model.feature_log_prob_.tolist()],
        "sample_count": len(samples),
        "label_counts": dict(Counter(labels)),
    }


def save(model: dict, path: Path = MODEL_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(model, handle, ensure_ascii=False, indent=1)
        handle.write("\n")


def load(path: Path = MODEL_PATH) -> dict:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


# ============================================================
# 判定（素のPythonだけ）
# ============================================================

def predict(text: str, model: dict) -> dict:
    """文体の確率を返す。**scikit-learn を読み込まない。**

    Returns:
        {
          "scores":    {"baby": 0.0〜1.0, "mother": ..., "neither": ...},
          "top":       いちばん高いクラス名,
          "matched":   学習済みのN-gramと一致した数,
          "confident": 判断がついたとみなせるか,
        }

    **matched が 0 のとき、scores は事前確率そのものである。**
    予測ではないので、そのまま点数にしてはいけない。
    """
    if not text or not text.strip():
        raise ValueError("空文字列は判定できません。")

    low, high = model["ngram_range"]
    vocabulary = model["vocabulary"]
    feature_log_prob = model["feature_log_prob"]
    scores = list(model["class_log_prior"])

    matched = 0
    for gram, count in Counter(char_ngrams(text, low, high)).items():
        index = vocabulary.get(gram)
        if index is None:
            continue
        matched += count
        for class_index in range(len(scores)):
            scores[class_index] += count * feature_log_prob[class_index][index]

    probabilities = _softmax(scores)
    classes = model["classes"]
    top_index = max(range(len(classes)), key=lambda i: probabilities[i])

    return {
        "scores": {name: probabilities[i] for i, name in enumerate(classes)},
        "top": classes[top_index],
        "matched": matched,
        "confident": (matched >= MIN_MATCHED_FEATURES
                      and probabilities[top_index] >= CONFIDENT_THRESHOLD),
    }


def _softmax(log_scores: list[float]) -> list[float]:
    """対数の足し算を確率へ戻す。大きい値を引いてから指数にする。"""
    largest = max(log_scores)
    exponentials = [math.exp(value - largest) for value in log_scores]
    total = sum(exponentials)
    return [value / total for value in exponentials]


# ============================================================
# 成績を測る
# ============================================================

def cross_validate(samples: list[dict], folds: int = 5) -> dict:
    """学習に使っていない文で当たるかを測る。

    **同じ文で学習して同じ文で測っても意味が無い。**
    データを分けて、片方で学習し、もう片方で測る。
    """
    if len(samples) < folds:
        raise ValueError(f"データが {len(samples)} 件では {folds} 分割できません。")

    correct = 0
    total = 0
    confusion: dict[str, Counter] = {name: Counter() for name in PERSONAS}

    for fold in range(folds):
        held_out = [s for i, s in enumerate(samples) if i % folds == fold]
        training = [s for i, s in enumerate(samples) if i % folds != fold]
        if not held_out or not training:
            continue
        model = train(training)
        for sample in held_out:
            result = predict(sample["text"], model)
            confusion[sample["persona"]][result["top"]] += 1
            correct += result["top"] == sample["persona"]
            total += 1

    return {
        "accuracy": correct / total if total else 0.0,
        "correct": correct,
        "total": total,
        "confusion": {name: dict(counts) for name, counts in confusion.items()},
    }


# ============================================================
# CLI
# ============================================================

def main() -> int:
    parser = argparse.ArgumentParser(
        description="文体のナイーブベイズを学習・確認します。")
    parser.add_argument("--train", action="store_true",
                        help="学習してモデルを保存します。")
    parser.add_argument("--text", help="1文だけ判定します。")
    parser.add_argument("--cross-validate", action="store_true",
                        help="学習に使っていない文で成績を測ります。")
    parser.add_argument("--data", type=Path, default=DATA_PATH)
    parser.add_argument("--model", type=Path, default=MODEL_PATH)
    args = parser.parse_args()

    if not (args.train or args.text or args.cross_validate):
        parser.print_help()
        return 1

    if args.train or args.cross_validate:
        samples = load_samples(args.data)
        print(f"学習データ {len(samples)}件 "
              f"{dict(Counter(s['persona'] for s in samples))}", file=sys.stderr)

    if args.cross_validate:
        result = cross_validate(samples)
        print(f"正解率 {result['accuracy']:.1%}"
              f"（{result['correct']}/{result['total']}）")
        for actual, predicted in result["confusion"].items():
            print(f"  {actual:8} → {predicted}")

    if args.train:
        model = train(samples)
        save(model, args.model)
        print(f"保存しました: {args.model}"
              f"（特徴量 {len(model['vocabulary'])}件）", file=sys.stderr)

    if args.text:
        model = load(args.model)
        result = predict(args.text, model)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if not result["confident"]:
            print("※ 判断がついていません。点数として使わないこと。", file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
