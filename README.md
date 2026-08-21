# engiiro-app（えんじいろ）

「エンジニアのための本音吐露SNS」。詳細な仕様は [`docs/design_doc.md`](./docs/design_doc.md) を参照してください。

## 構成

```
.
├── backend/    TypeScript / Deno（Deno Deployにデプロイ予定）
├── ai/         Python（PyTorch・scikit-learn、Hugging Face Spacesにデプロイ予定）
├── frontend/   技術未定（担当エンジニアが決定）
└── docs/       設計ドキュメント・図
```

## ローカル環境の立ち上げ方（Docker）

```bash
cp .env.example .env   # 必要な値を埋める
docker compose up --build
```

- `backend` … http://localhost:8000
- `ai`      … http://localhost:8001

### 注意：DockerはあくまでローカルDev用

- `backend/Dockerfile` はローカルでの動作確認・環境統一のためのものです。**本番はDeno Deploy（`deployctl` またはGitHub連携によるソースデプロイ）** を使うため、このDockerイメージ自体を本番にそのまま持ち込むわけではありません。
- `ai/Dockerfile` は逆に、**Hugging Face Spaces（Docker SDK）へそのままデプロイできる**想定で作っています。

## Denoのローカル実行（Dockerを使わない場合）

```bash
cd backend
deno task dev
```

## Pythonのローカル実行（Dockerを使わない場合）

```bash
cd ai
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --port 8001
```
