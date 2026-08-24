# AI サービス開発環境

このディレクトリには、AI 推論 API と、その実行に必要な Python 依存関係があります。
Sprint 1 では GPU や CUDA を前提にせず、Python 3.11 と CPU だけで再現できる環境を基準にします。

## 前提

- Python 3.11
- pip
- Docker Desktop（Docker で確認する場合）

仮想環境はリポジトリ外に作成します。これにより、Gitへの誤追加だけでなく、
Dockerのビルドコンテキストへローカル仮想環境が混入することも防ぎます。

## Windows PowerShell

リポジトリのルートから次を実行します。

```powershell
$engiiroAiVenv = Join-Path $env:LOCALAPPDATA "engiiro\venvs\ai"
py -3.11 -m venv $engiiroAiVenv
& "$engiiroAiVenv\Scripts\Activate.ps1"
python -m pip install --upgrade pip
python -m pip install -r ai/requirements.txt
python -m unittest discover -s ai/tests -p "test_*.py" -v
```

`py` ランチャーを使わない環境では、Python 3.11 の実行ファイルを明示して仮想環境を作成してください。

## 一般的なシェル

リポジトリのルートから次を実行します。

```sh
python3.11 -m venv "$HOME/.local/share/engiiro/venvs/ai"
. "$HOME/.local/share/engiiro/venvs/ai/bin/activate"
python -m pip install --upgrade pip
python -m pip install -r ai/requirements.txt
python -m unittest discover -s ai/tests -p 'test_*.py' -v
```

## バージョン確認

仮想環境を有効にした状態で、実際に読み込まれたバージョンを確認します。

```sh
python --version
python -m pip --version
python -c "import fastapi, uvicorn, pydantic, torch, sklearn; print('fastapi', fastapi.__version__); print('uvicorn', uvicorn.__version__); print('pydantic', pydantic.__version__); print('torch', torch.__version__); print('sklearn', sklearn.__version__)"
```

## ローカルでサービスを起動する

仮想環境を有効にしてから、`ai` ディレクトリで Uvicorn を起動します。

```sh
cd ai
python -m uvicorn app:app --host 127.0.0.1 --port 8001
```

別のターミナルからヘルスチェックを確認します。

```sh
curl http://127.0.0.1:8001/health
```

PowerShell では次でも確認できます。

```powershell
Invoke-RestMethod http://127.0.0.1:8001/health
```

期待するレスポンスは `{"status":"ok"}` です。

## Docker

リポジトリのルートから AI 用イメージを単体でビルドします。

```sh
docker build --tag engiiro-ai:local ./ai
```

イメージ内で環境スモークテストを実行します。

```sh
docker run --rm engiiro-ai:local python -m unittest discover -s tests -p 'test_*.py' -v
```

サービスを起動してヘルスチェックを確認します。

```sh
docker run --rm --detach --name engiiro-ai-smoke -p 8001:8001 engiiro-ai:local
curl http://127.0.0.1:8001/health
docker stop engiiro-ai-smoke
```

`docker compose` 全体の起動には、ルートの `.env` や他サービスの準備も関係します。
AI 環境だけを確認するときは、上記の単体ビルド・単体起動を使用してください。

## スモークテストの範囲

`ai/tests/test_environment.py` は次だけを確認します。

- 必要な Python ライブラリを import できる
- PyTorch が CPU 上で小さな Tensor 演算を実行できる
- scikit-learn が固定文字列で TF-IDF、学習、予測を実行できる
- `ai/app.py` を import でき、`/health` ルートと応答が存在する

このテストはモデル品質、エンドポイント契約、評価・変換ロジックの正しさを評価しません。

## 既知の制限

現在固定されている `torch==2.4.1` は、Linux の Docker 環境では CUDA 関連パッケージも
依存関係として導入します。CPU 上で実行できますが、検証時のイメージサイズは約 2.84 GiB でした。
依存関係の配布方法を変更する場合は、別途影響を確認して判断してください。
