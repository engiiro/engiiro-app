# AI機械学習環境

えんじいろの標準的な機械学習環境は、Google Colab上の
[`ai/notebooks/engiiro_colab.ipynb`](notebooks/engiiro_colab.ipynb) です。
`google/gemma-3-1b-it` を4bitで読み込み、QLoRAの最小スモーク学習、LoRAアダプターの保存・再読込、
`baby` / `mother` の推論、localhost限定のUvicornヘルスチェックまでを上から順に確認します。

この環境は開発・検証用です。Colabランタイムは一時的で、本番運用環境ではありません。

## 事前準備

1. Hugging FaceでGemmaの利用条件へ同意し、`google/gemma-3-1b-it` へのアクセスを取得します。
2. Colabの「シークレット」へ次を登録します。
   - `GITHUB_TOKEN`: privateリポジトリをcloneできる最小権限のトークン
   - `HF_TOKEN`: Gemmaを読み込めるHugging Faceトークン
3. 両シークレットについて、ノートブックからのアクセスを許可します。

トークンをセル、URL、出力、Git管理ファイルへ直接書かないでください。ノートブックは
`GITHUB_TOKEN` を一時的な `GIT_ASKPASS` 経由で渡し、clone後のremote URLをトークンなしのURLへ戻します。

## Colabでの実行

1. GitHub上の `ai/notebooks/engiiro_colab.ipynb` をGoogle Colabで開きます。
2. 「ランタイム」→「ランタイムのタイプを変更」からGPUを選びます。
3. 既定値が `SMOKE_TEST=True`、`FULL_TRAIN=False` であることを確認します。
4. 「すべてのセルを実行」で、上から順に実行します。
5. ランタイム情報、依存ライブラリの実バージョン、学習step・loss・時間・peak VRAM、
   adapterファイル、両モードの推論結果、`/health` の応答を確認します。
6. 最後の停止・後片付けセルまで実行します。

GPUを取得できなければ、モデル読込・学習・推論をCPUへ切り替えず停止します。別モデルへの自動フォールバックも行いません。
表示された未検証項目とランタイム情報を記録し、GPUランタイムで最初から再実行してください。

## 実行モードと上限

- `SMOKE_TEST=True`: 既定。学習は最大2 step、checkpointは保存しません。
- `FULL_TRAIN=True`: 人間がデータと設定を確認した場合だけ有効化します。最大2 epoch、checkpointは最大2個です。
- 両方を同時に有効化できません。
- 入力は最大256 token、生成は最大96 token、batch sizeは1、推論同時実行数は1です。
- 出力が150文字を超えた場合は一度だけ短文化を再依頼し、それでも超えれば切り捨てずエラーにします。

今回の標準確認はスモークテストです。長時間学習は行いません。

## 学習データ

JSONLまたはCSVで、各行に次の3項目が必要です。

| 項目 | 内容 |
| --- | --- |
| `mode` | `baby` または `mother` |
| `input` | 変換前の空でない文字列 |
| `output` | 期待する変換後の空でない文字列 |

`DATA_PATH` にColab上またはGoogle Drive上のパスを指定できます。`UPLOAD` を指定すると1ファイルを手動アップロードします。
未指定時の4件は、秘密情報を含まない環境確認専用サンプルです。モデル品質を評価できるデータではありません。
実データを使う前に、利用許諾、個人情報除去、重複、モード分布、評価基準を人間が確認してください。

## 保存物

保存するのはLoRAアダプターとtokenizer設定だけです。ベースモデルを複製・merge・Git追加しません。
既定の保存先はリポジトリ外のColab一時領域です。`USE_GOOGLE_DRIVE=True` の場合だけ、明示したGoogle Drive配下へ保存します。
Colab停止後も必要なアダプターだけを退避してください。重み、データ、トークンをGitへ追加しないでください。

LoRAだけを保存する理由は、ベースモデルの再配布を避け、保存容量を抑え、変更部分を明確にするためです。

## 責務の境界

Gemmaは `baby` / `mother` のテキスト変換だけを担当します。次はこのノートブックの対象外です。

- モデレーションや投稿可否判定
- 認証、永続化、公開API化、公開トンネル
- `ai/app.py` やバックエンドとのモデル統合
- 本番負荷・品質・安全性の保証

## ローカルCPUスモークテスト（補助）

既存のローカルテストは、CPU上の依存関係と `/health` を確認する補助手段として残します。
Colab/Gemma/QLoRA検証の代わりではありません。仮想環境はリポジトリ外に作成してください。

```powershell
$engiiroAiVenv = Join-Path $env:LOCALAPPDATA "engiiro\venvs\ai"
py -3.11 -m venv $engiiroAiVenv
& "$engiiroAiVenv\Scripts\Activate.ps1"
python -m pip install --upgrade pip
python -m pip install -r ai/requirements.txt
python -m unittest discover -s ai/tests -p "test_*.py" -v
```

`ai/tests/test_environment.py` はライブラリimport、CPU Tensor演算、固定文字列によるscikit-learn処理、
`ai/app.py` の `/health` だけを確認します。モデル品質やAPI契約を評価しません。

## Docker（従来の補助手段）

Dockerは現在もローカルCPU環境の再現に使えますが、標準の機械学習環境ではありません。

```sh
docker build --tag engiiro-ai:local ./ai
docker run --rm engiiro-ai:local python -m unittest discover -s tests -p 'test_*.py' -v
```

固定済みの `torch==2.4.1` はLinuxイメージでCUDA関連パッケージも導入し、過去の検証では約2.84 GiBでした。
配布方法を変える場合は、容量とCPU/GPU依存を別途確認してください。

## 現時点の検証状態

ノートブック構造、Python構文、既定の安全設定、変更範囲はローカルで検証します。
Colab GPU、private clone、Gemmaアクセス、4bit読込、学習、推論の実測には、利用者自身の
Colabランタイムと `GITHUB_TOKEN` / `HF_TOKEN` が必要です。未実行の場合は、成功したものとして扱わないでください。
