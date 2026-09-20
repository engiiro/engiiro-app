# engiiro-app（えんじいろ）

「エンジニアのための本音吐露SNS」。詳細な仕様は [`docs/design_doc.md`](./docs/design_doc.md) を参照してください。

## 構成

開発時の Issue（日報・タスク・バグ報告・その他）と PR の使い方は [開発の進め方](docs/DEVELOPMENT_WORKFLOW.md)、AI の作業ルールは [AGENTS.md](AGENTS.md) を参照してください。インターン期間中の AI 台帳・会話プロトコルは過去の記録として残していますが、現在は適用しません。

```
.
├── backend/    TypeScript / Deno（Deno Deployにデプロイ）
├── ai/         Python / FastAPI（Gemini API + ルールベースフォールバック、Cloud Runにデプロイ）
├── frontend/   React + TypeScript / Vite（Vercelにデプロイ）
└── docs/       設計ドキュメント・図
```

- フロントエンド: React + TypeScript + Vite。[Vercel](https://vercel.com/)にデプロイ（`frontend/app/`）
- バックエンド: TypeScript / Deno。[Deno Deploy](https://deno.com/deploy)にデプロイ。DBはDeno Deployが提供するPostgresを使用
- AI推論API: Python / FastAPI。文章変換（`/transform`）はGemini API（一次経路）とルールベースの辞書変換（フォールバック経路）の2段構え、文章評価（`/evaluate`）はフルスクラッチのナイーブベイズ3クラス分類器を使用。[Google Cloud Run](https://cloud.google.com/run)にデプロイ（`requirements.txt`のPyTorch・scikit-learnは、より本格的なモデルを組み込む場合に備えた予約で現時点では未使用）

## ローカル環境の立ち上げ方（Docker）

```bash
cp .env.example .env   # 必要な値を埋める
docker compose up --build
```

- `backend` … http://localhost:8000
- `ai`      … http://localhost:8001

### 注意：DockerはあくまでローカルDev用

- `backend/Dockerfile` はローカルでの動作確認・環境統一のためのものです。**本番はDeno Deploy（`deno deploy`サブコマンド、またはGitHub連携によるソースデプロイ）** を使うため、このDockerイメージ自体を本番にそのまま持ち込むわけではありません。Deno Deploy固有の制約は`backend/CLAUDE.md`を参照してください。
- `ai/Dockerfile` は本番でも**Google Cloud Runへそのままデプロイできる**想定で作っています（当初Hugging Face Spacesを想定していましたが、Cloud Runへ変更しました）。

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

## フロントエンドのローカル実行

```bash
cd frontend/app
npm install
npm run dev
```

Viteの開発サーバーが起動します（既定では http://localhost:5173 ）。バックエンドAPIの接続先は環境変数`VITE_API_BASE_URL`で指定します（未指定時は相対パス。ローカルのbackendを使う場合は`frontend/app/.env`に`VITE_API_BASE_URL=http://localhost:8000`のように設定してください）。

## 開発の裏側（jig.jp Webコース サマーインターンシップ2026）

本プロジェクトは[jig.jp Webコース サマーインターンシップ2026](https://intern.jig.jp/internships/2026-web/)（2026年8月21日〜28日、福井県鯖江市の開発センターでのチーム開発）にて、3人チームで開発した。役割分担は概ね以下の通り。

- **南口遼河**：設計書・DB設計・バックエンド実装、PMとしての進捗確認
- **大里鈴（あかとんぼ）**：AIエージェントを用いたイシュー/プルリク管理環境の構築、AIエージェントへのプロンプト設計（`AGENTS.md`）、MCPを使ったNotion連携
- **藤村湧志（ぱんや）**：フロントエンドのデザイン（配色等）・UI/UX（レイアウトや操作に対する演出）

（GitHub Organizationにはメンターの方も参加しているが、開発チーム自体は上記3名）

以下、各自が詰まった点・乗り越え方・工夫した点を書き残していく。git履歴に加え、各自が書いた[jig.jpインターン日誌ブログ](https://jigjp-diary2026.hatenablog.com/archive/2026)の記事([南口](https://jigjp-diary2026.hatenablog.com/entry/2026/09/03/194429)、[大里](https://jigjp-diary2026.hatenablog.com/entry/2026/08/28/234652)、[藤村](https://jigjp-diary2026.hatenablog.com/entry/2026/08/28/031125))も参考にしている（まとまっていなくてよい前提でまず書き出したもの。加筆・修正歓迎）。

### 南口遼河（設計書・DB・バックエンド・PM）

- DB設計とAPI実装を一人で持つ構成だったため、フロントエンド側がモック実装のまま並行して進められるよう、早い段階でAPI仕様を固めて共有することを意識した。結果的に終盤でモックから実APIへの差し替え（`8ab8d22`, `3397d88`）を大きな手戻りなく行えた。
- マイグレーションの実行順序に矛盾がある不具合（`ec764f9`）や、フィードの個人化ランキングが機能していない不具合（`bf874f4`）など、デプロイ後に見つかった問題は都度その場で切り分けて修正した。
- PMとしては、各メンバーのブランチをmainへ統合するタイミング調整（`merge: ... をmainへ反映する`系のコミット多数）を担当し、機能ごとに小さく統合することでコンフリクトが大きくならないようにした。

### 大里鈴（あかとんぼ）（AI開発環境・AGENTS.md・Notion連携）

- AIエージェント同士のissue/PRでのやり取りが破綻しないよう、`docs/AI_ISSUE_PROTOCOL.md`でAIの会話フォーマット・担当範囲の線引き・issueフォームごとのAIインスタンス振り分けを整理した。
- 赤ちゃん語・ママ語変換の初期実装ではGemma 4 31Bを採用したが、モデルが指示文自体を要約して返してしまう問題や、応答が空になる問題に直面。プロンプトを「補完スタイル」から「会話ターン方式」に作り直し、最終的にGemini 3.5 Flash Liteへの切り替えを判断した（`d0f7836`, `edd632f`, `6b25bb5`）。
- 途中で提供終了した旧SDKからの移行（`c361c29`）など、外部APIの仕様変更にも対応した。
- 発表本番当日の13時まで開発を続け、残り1時間でスライドを作り上げる「極限開発」になった。チームでの認識合わせの難しさ(自分の中では分かっていても他の人には伝わらないことがある)を実感した。
- AIエージェントを使った開発では「AIの報告をそのまま信じてはいけない」ことを学んだ。「修正しました」と報告があっても、実際にコードや動作を自分の目で確認する必要があると気づき、AIには早く進められる作業を任せつつ、最終確認は人間が担う体制にした。

### 藤村湧志（ぱんや）（フロントエンド：デザイン・UI/UX）

- 3テーマ（ノーマル／ダーク／園児UI）構成の中で、園児UIは説明文がカードの枠に収まりきらず表示が崩れる問題があり、レイアウトを調整して解消した（`00bdeab`）。
- デプロイ後の実機確認で見つかった表示・操作面の問題（`d9df29e`）や、アカウント登録画面の入力項目の整合性（`14a4cf5`）など、細かな作り込みを担当した。
- 終盤、各領域の進捗はそれぞれ出ているものの全部を合体させて動く形をまだ見られておらず、発表に間に合うか不安になる時期があった。開発の追い込みで生活リズムが崩れる中、こまめに相談に乗ってくれるリーダーと、度々開いてもらえる基礎知識勉強会のおかげで、詰まっても諦めずに続けられた。
