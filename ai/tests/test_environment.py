"""AI サービスの開発環境が最小限動作することを確認するテスト。"""

from __future__ import annotations

import importlib
import sys
import unittest
from pathlib import Path

import fastapi
import pydantic
import sklearn
import torch
import uvicorn
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression


AI_DIRECTORY = Path(__file__).resolve().parents[1]
if str(AI_DIRECTORY) not in sys.path:
    # リポジトリのルートから実行しても、ai/app.py と ai/src を import できるようにする。
    sys.path.insert(0, str(AI_DIRECTORY))


ai_app_module = importlib.import_module("app")


class EnvironmentSmokeTest(unittest.TestCase):
    """モデル品質ではなく、依存関係とCPU実行環境だけを検証する。"""

    def test_required_libraries_are_importable(self) -> None:
        libraries = (fastapi, uvicorn, pydantic, torch, sklearn)

        for library in libraries:
            with self.subTest(library=library.__name__):
                self.assertTrue(library.__version__)

    def test_pytorch_tensor_operation_runs_on_cpu(self) -> None:
        values = torch.tensor([[1.0, 2.0], [3.0, 4.0]], device="cpu")
        column = torch.ones((2, 1), device="cpu")

        result = values @ column

        self.assertEqual(result.device.type, "cpu")
        self.assertEqual(result.tolist(), [[3.0], [7.0]])

    def test_scikit_learn_can_fit_and_predict_fixed_text(self) -> None:
        training_texts = [
            "おぎゃー ねんね だっこ",
            "まんま ばぶ よしよし",
            "設計 レビュー 実装",
            "テスト 実行 確認",
        ]
        training_labels = ["baby", "baby", "engineering", "engineering"]
        prediction_texts = ["ねんね だっこ", "実装 テスト"]

        vectorizer = TfidfVectorizer()
        training_vectors = vectorizer.fit_transform(training_texts)
        classifier = LogisticRegression(random_state=0, solver="liblinear")
        classifier.fit(training_vectors, training_labels)

        predictions = classifier.predict(vectorizer.transform(prediction_texts))

        self.assertEqual(len(predictions), len(prediction_texts))
        self.assertTrue(set(predictions).issubset(set(training_labels)))

    def test_ai_app_imports_and_exposes_health_route(self) -> None:
        route_paths = {route.path for route in ai_app_module.app.routes}

        self.assertIn("/health", route_paths)
        self.assertEqual(ai_app_module.health(), {"status": "ok"})


if __name__ == "__main__":
    unittest.main()
