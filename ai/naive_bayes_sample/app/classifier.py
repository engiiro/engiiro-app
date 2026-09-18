"""
ナイーブベイズ分類器の、フルスクラッチ（scikit-learn 等を使わない、一から書いた）実装。

## これは何をするクラスか

文章を「赤ちゃん」「お母さん」「その他」の3クラスのどれに近いかを判定し、
それぞれの確率（％）を返す分類器。「学習」（fit）で文章とラベルの組から
統計情報を作り、「予測」（predict_proba）で新しい文章を判定する。

## ナイーブベイズって、結局何をしているの？

ひとことで言うと「その文章に含まれる単語ひとつひとつについて、
"この単語は赤ちゃん言葉の文章によく出てくるか、お母さん言葉によく出てくるか、
それともどちらでもない普通の文章によく出てくるか" を数え上げて、
その掛け算（＝全部の単語が同時にそのクラスに出てくる確率）が一番大きいクラスを選ぶ」
というアルゴリズム。

数式で書くと、ベイズの定理から次のように考える。

    P(クラス | 文章) ∝ P(クラス) × P(文章 | クラス)

- P(クラス) : 「事前確率」。学習データ全体のうち、そのクラスが占める割合。
  例えば学習データの半分が「赤ちゃん」クラスの文章なら、P(赤ちゃん) = 0.5。

- P(文章 | クラス) : 「尤度（ゆうど）」。そのクラスの文章として、
  いま見ている文章（＝単語の並び）が出現する確率。
  ナイーブベイズでは「文章中の単語は、他の単語と無関係にバラバラに出現する」
  という単純化（＝「ナイーブ（素朴）」の由来）を置く。この仮定のおかげで、

      P(文章 | クラス) = P(単語1 | クラス) × P(単語2 | クラス) × ... × P(単語N | クラス)

  という単純な掛け算に分解できる。実際には「疲れた」の後に「よぉ」が続きやすい、
  といった単語同士のつながりがあるはずだが、そこは無視して単純化している。
  それでも実用上はそこそこ良い精度が出ることが知られている。

- P(単語 | クラス) : そのクラスの文章の中で、その単語がどれくらいの割合で
  出現するか。「クラス内でのその単語の出現回数」÷「クラス内の全単語数」で求める
  （後述のラプラススムージングで少し補正する）。

## 実装上の工夫（つまずきやすいポイント）

1. 確率の掛け算は、単語数が増えるとどんどん小さな数になり、
   コンピュータの数値表現の限界（アンダーフロー）で 0 になってしまう。
   そこで、掛け算のかわりに「対数（log）を取ってから足し算する」方法を使う。
   log(a × b) = log(a) + log(b) という対数の性質を利用している。

2. 学習データに一度も出てこなかった単語が新しい文章に含まれていた場合、
   その単語の出現確率が 0 になってしまい、掛け算（対数では足し算）の結果も
   0（対数では -∞）になってしまう。これを避けるため「ラプラススムージング」
   （全ての単語の出現回数に、実際には無くても +1 したことにする）を行う。
"""

from __future__ import annotations

import math
import sys
from collections import Counter
from pathlib import Path

if __name__ == "__main__":
    # `python app/classifier.py` のようにファイルパスを直接指定して実行したとき、
    # 下の `from app.tokenizer import ...`（app パッケージからの絶対インポート）が
    # 失敗しないようにするための設定。
    #
    # Python は「実行したスクリプトがあるディレクトリ」を import の検索対象に
    # 自動で加える。今回そのディレクトリは app/ なので、そのままでは
    # 「app という名前のパッケージ」を app/ の中から探してしまい見つからない。
    # そこで、プロジェクトのルートディレクトリ（app/ の1つ上）を検索パスの先頭に
    # 追加し、`app.tokenizer` を正しく解決できるようにしている。
    #
    # モジュールとして読み込まれる場合（例: main.py から import される場合）は
    # この処理は不要なので、`if __name__ == "__main__":` の中だけで行う。
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from .tokenizer import tokenize


class NaiveBayesClassifier:
    """多項（マルチノミアル）ナイーブベイズ分類器。"""

    def __init__(self) -> None:
        # fit() が呼ばれるまでは空。学習後に中身が入る。
        # クラス名 -> 事前確率 P(クラス)
        self._class_priors: dict[str, float] = {}
        # クラス名 -> {単語: そのクラス内での出現回数}
        self._word_counts_per_class: dict[str, Counter[str]] = {}
        # クラス名 -> そのクラス内の単語の総出現回数（延べ数）
        self._total_words_per_class: dict[str, int] = {}
        # 学習データ全体に登場した、重複の無い単語の集合（語彙）
        self._vocabulary: set[str] = set()

    @property
    def is_fitted(self) -> bool:
        """学習済みかどうか。"""
        return bool(self._class_priors)

    def fit(self, texts_by_class: dict[str, list[str]]) -> None:
        """
        学習データから、各クラスの統計情報（事前確率・単語の出現回数）を計算する。

        Parameters
        ----------
        texts_by_class:
            {"赤ちゃん": ["ばぶー ねむい", ...], "お母さん": [...], "その他": [...]}
            のような、クラス名 -> そのクラスに属する文章のリスト、という辞書。
        """
        total_text_count = sum(len(texts) for texts in texts_by_class.values())
        if total_text_count == 0:
            raise ValueError(
                "学習データが1件もありません。data/ 配下の各クラスのディレクトリに "
                "JSON ファイルを置いてください。"
            )

        self._class_priors.clear()
        self._word_counts_per_class.clear()
        self._total_words_per_class.clear()
        self._vocabulary.clear()

        for class_name, texts in texts_by_class.items():
            # --- 事前確率 P(クラス) を計算する ---
            # 「学習データ全体のうち、このクラスの文章が占める割合」がそのまま事前確率になる。
            self._class_priors[class_name] = len(texts) / total_text_count

            # --- このクラスに属する全文章を単語に分割し、出現回数を数える ---
            word_counts: Counter[str] = Counter()
            for text in texts:
                words = tokenize(text)
                word_counts.update(words)
                self._vocabulary.update(words)

            self._word_counts_per_class[class_name] = word_counts
            self._total_words_per_class[class_name] = sum(word_counts.values())

    def _log_likelihood(self, words: list[str], class_name: str) -> float:
        """
        あるクラスについて、文章（単語のリスト）の対数尤度 log P(文章 | クラス) を計算する。

        本来の尤度 P(文章 | クラス) は各単語の確率の「掛け算」だが、
        アンダーフロー対策として対数を取った「足し算」で計算する。
        """
        word_counts = self._word_counts_per_class[class_name]
        total_words = self._total_words_per_class[class_name]
        vocab_size = len(self._vocabulary)

        log_likelihood = 0.0
        for word in words:
            # ラプラススムージング：分子に +1、分母に +vocab_size することで、
            # 学習データに一度も出てこなかった単語（word_counts[word] == 0）でも
            # 確率が完全な 0 にならないようにする。
            count_in_class = word_counts.get(word, 0)
            probability = (count_in_class + 1) / (total_words + vocab_size)
            log_likelihood += math.log(probability)

        return log_likelihood

    def predict_proba(self, text: str) -> dict[str, float]:
        """
        文章を分類し、各クラスに属する確率をパーセンテージ（合計100）で返す。

        戻り値の例:
            {"赤ちゃん": 82.3, "お母さん": 10.1, "その他": 7.6}
        """
        if not self.is_fitted:
            raise RuntimeError("先に fit() を呼んで学習させてください。")

        words = tokenize(text)

        # クラスごとに「事後確率に比例する値」を対数のまま計算する。
        # log P(クラス | 文章) ∝ log P(クラス) + log P(文章 | クラス)
        log_posteriors: dict[str, float] = {}
        for class_name, prior in self._class_priors.items():
            log_posteriors[class_name] = math.log(prior) + self._log_likelihood(
                words, class_name
            )

        # --- 対数の世界から、合計が1になる確率（％で言えば合計100）に変換する ---
        # 単純に exp() を取って正規化するだけだと、log_posteriors の値が
        # 大きく（絶対値が大きく）なりすぎたときに exp() がオーバーフローしうる。
        # そこで「最大値を引いてから exp() を取る」（log-sum-exp トリック）ことで、
        # 数値的に安定させつつ、最終的な比率（どのクラスが何倍優勢か）は変えないようにする。
        max_log_posterior = max(log_posteriors.values())
        unnormalized = {
            class_name: math.exp(value - max_log_posterior)
            for class_name, value in log_posteriors.items()
        }
        total = sum(unnormalized.values())

        return {
            class_name: round(value / total * 100, 1)
            for class_name, value in unnormalized.items()
        }

    def predict_with_confidence(self, text: str, threshold: float = 0.60) -> dict[str, object]:
        """予測結果と信頼度を返す。

        `threshold` は固定仕様ではなく、固定テストセットで調整する運用値。
        0〜1 の比率、または 0〜100 の百分率のどちらでも受け付ける。
        """
        if not 0 < threshold <= 100:
            raise ValueError("threshold は 0 より大きく 100 以下にしてください")
        cutoff = threshold * 100 if threshold <= 1 else threshold
        probabilities = self.predict_proba(text)
        predicted_class = max(probabilities, key=probabilities.get)  # type: ignore[arg-type]
        confidence = probabilities[predicted_class]
        return {
            "probabilities": probabilities,
            "predicted_class": predicted_class,
            "confidence": confidence,
            "passes_threshold": confidence >= cutoff,
            "threshold": cutoff,
        }

    def predict(self, text: str) -> str:
        """一番確率が高いクラス名だけを返す（確率の内訳は不要なときに使う）。"""
        probabilities = self.predict_proba(text)
        return max(probabilities, key=probabilities.get)  # type: ignore[arg-type]


if __name__ == "__main__":
    # このファイルを直接実行した（`python app/classifier.py`）ときだけ動くコード。
    #
    # 1. data/ 配下の学習データを読み込む
    # 2. 分類器を学習させる
    # 3. いくつかのサンプル文章を分類し、確率の内訳を表示する
    #
    # FastAPI サーバーを立てなくても、この1ファイルだけで
    # 「学習 → 予測」の一連の流れを確認できるようにしてある。
    from .data_loader import load_training_data

    print("=== 学習データを読み込み中 ===")
    dataset = load_training_data()
    for class_name, texts in dataset.items():
        print(f"  [{class_name}] {len(texts)} 件")

    print("\n=== 分類器を学習中 ===")
    classifier = NaiveBayesClassifier()
    classifier.fit(dataset)
    print("学習が完了しました。")

    sample_texts = [
        "ばぶー ねむいよぉ、おしごとつかれたでちゅ",
        "よしよし、今日もよく頑張ったね。無理しないでゆっくり休んでね",
        "本日の定例会議は15時から会議室Aで行います。",
    ]

    print("\n=== サンプル文章を分類 ===")
    for text in sample_texts:
        probabilities = classifier.predict_proba(text)
        print(f"\n入力: {text}")
        for class_name, percentage in probabilities.items():
            print(f"  {class_name}: {percentage}%")
        print(f"  → 判定結果: {classifier.predict(text)}")
