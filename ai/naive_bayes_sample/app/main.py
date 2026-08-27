"""
赤ちゃん・お母さん言葉判定 API（FastAPI アプリ本体）。

## このファイルの役割

`app/classifier.py` で実装したナイーブベイズ分類器を、Web API として
外から呼び出せるようにするための「入り口」。やっていることは大きく2つだけ。

1. サーバー起動時に、`data/` 配下の学習データで分類器を学習させておく
2. `POST /predict` にリクエストが来たら、分類器で判定して結果を返す

## ローカルでの動かし方

方法は2通りある。

### 方法A: このファイルを直接実行する（一番手軽）

    python app/main.py

これだけで、学習が終わったあと `http://127.0.0.1:8000` でサーバーが立ち上がる。
ブラウザで `http://127.0.0.1:8000/docs` を開くと、Swagger UI という
対話的な画面が出てきて、ブラウザ上から `/predict` を試すことができる。

### 方法B: uvicorn コマンドで起動する（コードの変更を自動反映したいとき）

    uvicorn app.main:app --reload

`--reload` を付けると、コードを編集して保存するたびにサーバーが自動で
再起動されるので、開発中はこちらが便利。
"""

from __future__ import annotations

import sys
from contextlib import asynccontextmanager
from pathlib import Path

if __name__ == "__main__":
    # `python app/main.py` のようにファイルパスを直接指定して実行したときのために、
    # プロジェクトルートを import 検索パスに追加する。
    # 詳しい理由は app/classifier.py の同じ箇所のコメントを参照。
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI
from pydantic import BaseModel, Field

from .classifier import NaiveBayesClassifier
from .data_loader import load_training_data
from .moderation import is_abusive

# 分類器はモジュールのトップレベルで1つだけ作る。
# リクエストのたびに学習し直すと遅いので、サーバー起動時に一度だけ学習させ、
# 以降はずっとこのインスタンスを使い回す。
classifier = NaiveBayesClassifier()


def train_classifier() -> None:
    """data/ 配下の学習データを読み込み、classifier を学習させる。"""
    dataset = load_training_data()
    classifier.fit(dataset)
    total = sum(len(texts) for texts in dataset.values())
    print(f"[起動] 学習データ {total} 件で分類器を学習しました。")
    for class_name, texts in dataset.items():
        print(f"  [{class_name}] {len(texts)} 件")


@asynccontextmanager
async def lifespan(_: FastAPI):
    # FastAPI アプリの起動時・終了時に処理を挟むための仕組み（lifespan）。
    # ここでは「起動したタイミングで学習を済ませておく」という処理だけを行う。
    train_classifier()
    yield
    # yield より後に終了時の処理を書けるが、今回は何もしなくてよい。


app = FastAPI(
    title="赤ちゃん・お母さん言葉判定API",
    description=(
        "文章が「赤ちゃん言葉」「お母さん言葉」「その他（普通の文章）」の"
        "どれにどれくらい近いかを、ナイーブベイズという手法で判定するAPI。"
    ),
    lifespan=lifespan,
)


class PredictRequest(BaseModel):
    """POST /predict に送るリクエストボディ。"""

    text: str = Field(
        ...,
        description="判定したい文章",
        examples=["ばぶー ねむいよぉ、おしごとつかれたでちゅ"],
    )


class PredictResponse(BaseModel):
    """POST /predict が返すレスポンスボディ。"""

    text: str = Field(description="判定した文章（そのまま返す）")
    probabilities: dict[str, float] = Field(
        description="クラスごとの確率（%）。3クラスの値を足すとおよそ100になる。"
    )
    predicted_class: str = Field(description="一番確率が高かったクラスの名前")


@app.get("/health")
def health() -> dict[str, object]:
    """サーバーが起動していて、分類器が学習済みかどうかを確認するためのエンドポイント。"""
    return {"status": "ok", "trained": classifier.is_fitted}


@app.post("/predict", response_model=PredictResponse)
def predict(request: PredictRequest) -> PredictResponse:
    """
    文章を受け取り、赤ちゃん／お母さん／その他、それぞれの確率（%）を返す。

    curl での実行例:

        curl -X POST http://127.0.0.1:8000/predict \\
          -H "Content-Type: application/json" \\
          -d '{"text": "ばぶー ねむいよぉ"}'
    """
    probabilities = classifier.predict_proba(request.text)
    predicted_class = max(probabilities, key=probabilities.get)  # type: ignore[arg-type]
    # 明示的な攻撃表現は、確率の大小にかかわらず「その他」に固定する。
    if is_abusive(request.text):
        predicted_class = "その他"
    return PredictResponse(
        text=request.text,
        probabilities=probabilities,
        predicted_class=predicted_class,
    )


if __name__ == "__main__":
    # このファイルを直接実行した（`python app/main.py`）ときだけ動くコード。
    # `uvicorn` コマンドを別途打たなくても、これだけでサーバーが起動する。
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
