# backend

「えんじいろ」のバックエンドAPI。Deno + PostgreSQLで実装する。
エンドポイント仕様は`../docs/design_doc.md` 7章、DBスキーマは同6章（ER図・DDL）を参照。

## ローカルで動かす

Docker Desktop または Rancher Desktop が必要。

```sh
cd backend

# 1. Postgresを起動する
docker compose up -d

# 2. 接続情報を環境変数に入れる（ターミナルを開き直すたびに必要）
export PGHOST=localhost PGPORT=5432 PGUSER=engiiro PGPASSWORD=engiiro PGDATABASE=engiiro

# 3. テーブルを作る
deno task migrate

# 4. サーバを起動する
deno task dev
```

`http://localhost:8000/health` を開いて `{"status":"ok","db":"up"}` が返れば、
アプリもDBも正常に起動している。

## タスク一覧

| コマンド                       | 内容                                                 |
| ------------------------------ | ---------------------------------------------------- |
| `deno task dev`                | 開発サーバを起動（ファイル変更で自動再起動）         |
| `deno task start`              | 本番相当の起動                                       |
| `deno task migrate`            | 未適用のマイグレーションを適用                       |
| `deno task migrate:down`       | 直近のマイグレーションを1つ戻す                      |
| `deno task migrate:new <名前>` | 新しいマイグレーションファイルを`migrations/`に作成  |
| `deno task check`              | 型チェック・lint・フォーマットチェックをまとめて実行 |

## 構成

```
main.ts               エントリポイント。ルーティング
src/lib/db.ts          Postgres接続プールと query()
src/lib/http.ts         共通のHTTPヘルパー（JSONレスポンス、入力検証など）
src/routes/            エンドポイントごとのハンドラ
migrations/            DBスキーマの変更履歴（SQL）
compose.yml            ローカル開発用のPostgres
```

Deno Deploy固有の制約（環境変数の自動注入、Pre-Deploy Commandでのマイグレーション適用など）は`CLAUDE.md`にまとめている。
