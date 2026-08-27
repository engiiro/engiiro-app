# AI方式比較環境

Sprint 1では、次の2方式を分離して実行時間を比較します。

1. **PyTorch-only Colab方式**
   - `ai/notebooks/engiiro_colab.ipynb`
   - Google Colab上で小型seq2seqモデルをゼロから学習・推論する
   - 事前学習済み大規模言語モデルやTransformers系ライブラリは使わない
2. **Gemma通常Python方式**
   - `ai/gemma_benchmark.py`
   - 通常のPython環境で、人間が別途用意したローカルGemmaモデルを読み込んで推論する
   - モデルの取得元、認証方法、配置先、デプロイ先は決めない

両方式は同じ2入力を3回ずつ処理し、共通形式のJSONへ時間を記録します。
現時点ではどちらも実測していないため、どちらが速いかは未決定です。

## 比較する時間

主判定にはcold startの `workload_seconds` を使います。これは依存import、モデル準備、
推論の合計です。ノートブック表示やCLI出力の差が混ざる `end_to_end_seconds` は参考値として残します。

| 項目 | PyTorch Colab | Gemma Python |
| --- | --- | --- |
| `dependency_import_seconds` | PyTorch import | PyTorch・Transformers import |
| `model_prepare_seconds` | 小型モデル初期化・学習 | ローカルGemma読込 |
| `inference_seconds` | 同じ2入力×3回 | 同じ2入力×3回 |
| `workload_seconds` | 上記3項目の合計 | 上記3項目の合計 |
| `end_to_end_seconds` | 最初の設定セルから結果作成まで | スクリプト開始から結果作成まで |

Colabの起動待ち、Python環境を手で作る時間、モデルを別途用意する時間は含みません。
異なるハードウェア上の結果は、方式だけでなく実行環境の差も含む「実際の作業経路」の比較です。

比較できるのは、両JSONで次が一致し、両方が `success=true` の場合だけです。

- `benchmark_id`
- `input_digest`
- `repeat_count`

この比較は速度だけを対象とし、出力品質、開発工数、費用、運用性、安全性は別に評価します。

## 方式1: PyTorch-only Colab

1. GitHub上の `ai/notebooks/engiiro_colab.ipynb` をGoogle Colabで開きます。
2. CPUまたはGPUランタイムを選びます。
3. 「すべてのセルを実行」で上から順に実行します。
4. `/content/pytorch_colab_benchmark.json` を保存します。

ノートブックはColabに導入済みのPyTorchをそのまま使い、再インストールしません。
固定された小さな学習データを使い、40 epochだけ学習します。これは速度経路の成立確認用であり、
モデル品質を評価できるデータではありません。

Colabは一時環境です。ランタイム終了後はモデルと一時ファイルが消えます。
本番サーバ、常時公開API、永続ストレージとしては使いません。

## 方式2: Gemma通常Python

`ai/gemma_benchmark.py` は、ローカルに存在するGemma互換モデルディレクトリだけを読み込みます。
モデルのダウンロード、認証、外部サービス接続、公開、デプロイは行いません。

### Python環境

仮想環境はリポジトリ外へ作成してください。依存関係の例は次のとおりです。

```sh
python -m pip install "torch>=2.4" "transformers>=4.51,<5" "accelerate>=1.4,<2"
```

CUDAで4bit量子化を明示的に試す場合だけ、追加で導入します。

```sh
python -m pip install "bitsandbytes>=0.45,<1"
```

既存の `ai/requirements.txt` はAPI環境用なので、このGemma実験の依存固定には使いません。
比較条件を実測するまで、Gemma用requirementsファイルも新設しません。

### 実行

モデルディレクトリは人間が選び、リポジトリ外のパスを渡します。

```sh
python ai/gemma_benchmark.py \
  --model-path "/path/to/local-gemma-model" \
  --output "/path/to/results/gemma_python_benchmark.json"
```

CUDA 4bitを使う場合は `--device cuda --four-bit` を追加します。CPUを明示する場合は
`--device cpu`、自動選択は既定の `--device auto` です。

スクリプトは `local_files_only=True` で読み込みます。指定ディレクトリに必要ファイルがなければ停止し、
ネットワークから自動取得しません。結果JSONにはモデルディレクトリの絶対パスを保存せず、末尾名だけを記録します。

## 結果を比較する

Gemma側でPyTorch結果と比較する例です。

```sh
python ai/gemma_benchmark.py \
  --model-path "/path/to/local-gemma-model" \
  --output "/path/to/results/gemma_python_benchmark.json" \
  --compare-with "/path/to/results/pytorch_colab_benchmark.json"
```

または、PyTorchノートブックの `OTHER_RESULT_PATH` にGemma結果JSONを指定して比較セルを実行します。

結果JSON、モデル重み、学習データ、認証情報はGitへ追加しないでください。

## 責務の境界

今回の成果物は2方式の速度実験だけを担当します。次は変更・確定しません。

- モデルの取得元、認証方式、配布先、デプロイ先
- 常時公開APIや公開トンネル
- モデレーションや投稿可否判定
- バックエンド／フロントエンド統合
- APIのリクエスト・レスポンス契約
- 本番運用、モデル品質、安全性の保証

## 参考分類器の統合

`ai/naive_bayes_sample/` に、別リポジトリ
`https://github.com/engiiro/naive-bayes-sample` の教育用ナイーブベイズ分類器を
取り込んでいます。形態素解析、データ読み込み、分類計算、最小の FastAPI 入口を
サンプルリポジトリの構成のまま確認できます。

これは学習の仕組みを理解するための分離されたサンプルです。既存の `ai/app.py`
や本番APIには接続していません。実運用へ接続する場合は、データ形式、重複除去、
固定評価セット、信頼度の扱い、モデレーションとの責務分担を別途レビューしてから
行います。

統合サンプルには、全3ラベルを含む `data/fixed_test.json`、ゼロ幅文字・空白挿入を
含む重複検査、明示的な差し替えを要求する `dataset_quality.py`、および閾値を候補から
選ぶ `evaluation.py` を含めています。年齢ラベルは分類データへ混ぜず、別JSONを
`age_labels.py` で読み込みます。

## 既存CPU環境テスト

`ai/tests/test_environment.py` は、既存API環境の補助スモークテストとして残します。

```powershell
$engiiroAiVenv = Join-Path $env:LOCALAPPDATA "engiiro\venvs\ai"
py -3.11 -m venv $engiiroAiVenv
& "$engiiroAiVenv\Scripts\Activate.ps1"
python -m pip install -r ai/requirements.txt
python -m unittest discover -s ai/tests -p "test_*.py" -v
```

これはPyTorch Colab方式とGemma方式の速度比較を代替しません。Dockerも従来の補助手段であり、
今回の2方式比較の標準実行環境には含めません。

## 現時点の検証状態

ファイル構造、Python構文、ノートブックJSON、共通比較契約はローカルで検証します。
Colab上の学習と、ローカルGemmaモデルを使った推論は、各実行環境がないため未実測です。
両方のJSONが揃うまでは勝者を決めません。
