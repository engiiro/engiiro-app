"""
文章の「赤ちゃん／お母さん／その他」3クラス判定を行うナイーブベイズ分類器。

`engiiro/naive-bayes-sample`（教育用サンプルリポジトリ）で作られたロジック
（`app/tokenizer.py` + `app/classifier.py` + `app/data_loader.py`、単語分割ベースの
フルスクラッチ多項ナイーブベイズ）をそのまま使う。学習データは`ai/data/style_classifier/`
配下で、**このディレクトリが学習データの正本（唯一の置き場）**。

以前は同じ学習データが複数箇所に分散していた
（`naive-bayes-sample`リポジトリのPRと、engiiro-appリポジトリの別PRの双方に
別々のデータが追加され続けていた）。2026-08-27に両方の内容を突き合わせて
統合し、以後はここへ追記する運用にした。詳細は同ディレクトリの`README.md`参照。

`evaluate()`（`ai/src/evaluate.py`）から、`POST /api/ai/evaluate`のFR-AI-EVAL-007の
`passesThreshold`判定に使う。閾値は50（度合いが50を超えたら通す。人間監督の決定）。
"""

from __future__ import annotations

import json
import math
import re
from collections import Counter
from pathlib import Path
from typing import Iterable

import fugashi

CLASS_NAMES: tuple[str, ...] = ("赤ちゃん", "お母さん", "その他")

_DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "style_classifier"

# personaType(API側の値) -> このクラス名の確率(度合い)を閾値判定に使う
PERSONA_TYPE_TO_CLASS = {"baby": "赤ちゃん", "mother": "お母さん"}

THRESHOLD = 50.0  # 度合い(0〜100)がこれを超えたら通す(人間監督の決定、2026-08-27)。

_tagger = fugashi.Tagger()
_HAS_LETTER_PATTERN = re.compile(r"[ぁ-んァ-ヶー一-龠a-zA-Z]")


def tokenize(text: str) -> list[str]:
    """文章を単語(トークン)のリストに分割する。記号・数字だけのトークンは除外する。"""
    words = [morpheme.surface for morpheme in _tagger(text)]
    return [word for word in words if _HAS_LETTER_PATTERN.search(word)]


def _load_texts_from_directory(directory: Path) -> list[str]:
    texts: list[str] = []
    if not directory.exists():
        return texts
    for json_path in sorted(directory.glob("*.json")):
        with json_path.open(encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, list):
            continue
        texts.extend(item for item in data if isinstance(item, str) and item.strip())
    return texts


def load_training_data() -> dict[str, list[str]]:
    return {
        class_name: _load_texts_from_directory(_DATA_DIR / class_name)
        for class_name in CLASS_NAMES
    }


class NaiveBayesClassifier:
    """多項(マルチノミアル)ナイーブベイズ分類器(ラプラススムージング付き)。"""

    def __init__(self) -> None:
        self._class_priors: dict[str, float] = {}
        self._word_counts_per_class: dict[str, Counter[str]] = {}
        self._total_words_per_class: dict[str, int] = {}
        self._vocabulary: set[str] = set()

    @property
    def is_fitted(self) -> bool:
        return bool(self._class_priors)

    def fit(self, texts_by_class: dict[str, list[str]]) -> None:
        total_text_count = sum(len(texts) for texts in texts_by_class.values())
        if total_text_count == 0:
            raise ValueError(
                "学習データが1件もありません。ai/data/style_classifier/ 配下の"
                "各クラスのディレクトリにJSONファイルを置いてください。"
            )

        self._class_priors.clear()
        self._word_counts_per_class.clear()
        self._total_words_per_class.clear()
        self._vocabulary.clear()

        for class_name, texts in texts_by_class.items():
            self._class_priors[class_name] = len(texts) / total_text_count

            word_counts: Counter[str] = Counter()
            for text in texts:
                words = tokenize(text)
                word_counts.update(words)
                self._vocabulary.update(words)

            self._word_counts_per_class[class_name] = word_counts
            self._total_words_per_class[class_name] = sum(word_counts.values())

    def _log_likelihood(self, words: Iterable[str], class_name: str) -> float:
        word_counts = self._word_counts_per_class[class_name]
        total_words = self._total_words_per_class[class_name]
        vocab_size = len(self._vocabulary)

        log_likelihood = 0.0
        for word in words:
            count_in_class = word_counts.get(word, 0)
            probability = (count_in_class + 1) / (total_words + vocab_size)
            log_likelihood += math.log(probability)
        return log_likelihood

    def predict_proba(self, text: str) -> dict[str, float]:
        """各クラスに属する確率(度合い)をパーセンテージ(合計100)で返す。"""
        if not self.is_fitted:
            raise RuntimeError("先にfit()を呼んで学習させてください。")

        words = tokenize(text)

        log_posteriors: dict[str, float] = {}
        for class_name, prior in self._class_priors.items():
            log_posteriors[class_name] = math.log(prior) + self._log_likelihood(
                words, class_name
            )

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


_classifier: NaiveBayesClassifier | None = None


def get_classifier() -> NaiveBayesClassifier:
    """学習済み分類器を返す(初回呼び出し時にのみ学習し、以降はキャッシュを使い回す)。"""
    global _classifier
    if _classifier is None:
        classifier = NaiveBayesClassifier()
        classifier.fit(load_training_data())
        _classifier = classifier
    return _classifier


def passes_threshold(body: str, persona_type: str) -> bool:
    """
    personaTypeに対応するクラスの度合いがTHRESHOLDを超えているか判定する
    (FR-AI-EVAL-007)。対応するクラスが無いpersonaTypeはFalseを返す。
    """
    class_name = PERSONA_TYPE_TO_CLASS.get(persona_type)
    if class_name is None:
        return False
    probabilities = get_classifier().predict_proba(body)
    return probabilities[class_name] > THRESHOLD
