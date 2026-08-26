# backend/ で作業するときの前提

`backend/`はDeno Deploy上で動くREST APIサーバ。`Deno.serve`でリクエストを受け、
`npm:pg`でPostgresに接続する。リポジトリ全体のルールは`AGENTS.md`（リポジトリルート）
を参照。ここに書くのはDeno Deploy固有の技術的な制約。

## 最初に読むこと

Deno Deployは2025年に作り直されており、モデルの学習データに残っている情報は
古い可能性が高い。Deployまわりで手が止まったら、記憶ではなく次のページを
WebFetchで読む。ドキュメントと自分の記憶が食い違った場合は、ドキュメントを優先する。

- <https://docs.deno.com/deploy/reference/databases.md>: Postgresのプロビジョニング、注入される環境変数、Pre-Deploy Command
- <https://docs.deno.com/deploy/reference/runtime.md>: 実行環境、インスタンスの寿命、コールドスタート
- <https://docs.deno.com/deploy/reference/env_vars_and_contexts.md>: 環境変数とコンテキスト（production / development / build）
- <https://docs.deno.com/deploy/reference/builds.md>: Install / Build / Pre-Deployの実行順、warmupフェーズ
- <https://docs.deno.com/deploy/reference/tunnel.md>: 手元のプロセスをDeployに繋ぐ

上記に載っていない話題は<https://docs.deno.com/llms.txt>から該当ページを探す。

## 書いてはいけないこと

以下はすべて古い情報。コード、設定、ドキュメント、コミットメッセージのいずれにも
登場させない。

- `deployctl`コマンド。現在は`deno deploy`サブコマンド
- `dash.deno.com`。Deploy Classicの URLで、停止済み。現在は`console.deno.com`
- `deno.land/std`の`serve()`。`Deno.serve()`だけを使う。旧`serve()`を使うと
  デプロイ時にwarmupフェーズでタイムアウトする
- 接続文字列を`.env`にハードコードする手順。Deployが`PG*`を自動注入するため不要

デプロイ手段として`deno deploy`で手元のディレクトリを直接送る手順も案内しない。
ビルド工程を通らないためマイグレーションが流れない。

## 構成

```
main.ts               Deno.serve とルーティング。エントリポイント
src/lib/db.ts          接続プールと query()。pg に依存するのはここだけ
src/lib/http.ts         Route 型、JSON レスポンス、リクエストボディの検証補助
src/routes/            エンドポイントごとのハンドラ
migrations/            node-pg-migrate の SQL マイグレーション
compose.yml            ローカル開発用の Postgres。Deploy では使わない
deno.json              タスクと import マップ
```

エンドポイント一覧・リクエスト/レスポンス形式は`docs/design_doc.md` 7章、
DBスキーマは同6章（ER図・DDL）が正本。実装で仕様と食い違いが出た場合は
仕様書を疑い、必要なら`docs/`の変更としてPOに確認する（`AGENTS.md`参照）。

## 触る前に知っておくこと

接続情報を引数で渡さない。`new Pool({ max: 3 })`のように接続情報を省くと、
`npm:pg`が`PGHOST` / `PGPORT` / `PGDATABASE` / `PGUSER` / `PGPASSWORD`を読む。
Deployはこれらを環境ごとに違う値で注入するため、コードに書くとproductionと
previewが同じDBを指してしまう。

プールはモジュールのトップレベルで1回だけ作る。リクエストごとに`new Pool()`
すると接続が使い捨てになり、DBの接続上限をすぐ使い切る。

`max`を増やさない。Deno Deployはアクセスに応じてインスタンスを増やすので、
DBが受ける接続数はインスタンス数 × `max`になる。

`pool.on("error", ...)`を消さない。idle状態の接続がDB側から切られたときに発火する。
購読していないと未処理エラーになり、プロセスごと落ちる。

## マイグレーション

`node-pg-migrate`を使う。`DATABASE_URL`が無ければ`PG*`にフォールバックするため、
ローカルでもDeploy上でも同じ環境変数だけで動く。

- 新規作成: `deno task migrate:new <名前>`
- 適用: `deno task migrate`
- 1つ戻す: `deno task migrate:down`

新しいマイグレーションファイルは`-- Up Migration`と`-- Down Migration`の下に
それぞれ追加のSQLと元に戻すSQLを書く。**一度pushしたファイルは編集せず、
変更は新しいファイルを足して表現する**（`docs/design_doc.md` 6.2章のDDLと
実装がずれた場合も同様）。

Deploy上ではconsole.deno.comのPre-Deploy Commandに`deno task migrate`を
設定する想定（本番デプロイ設定は別Issueで扱う）。

## ローカルで動かす

```sh
cd backend
docker compose up -d
export PGHOST=localhost PGPORT=5432 PGUSER=engiiro PGPASSWORD=engiiro PGDATABASE=engiiro
export JWT_SECRET=local-dev-secret-do-not-use-in-production
deno task migrate
deno task dev
```

## 認証

`src/lib/auth.ts`がパスワードのハッシュ化（`node:crypto`のscrypt）とJWTの発行・検証
（`@zaubrik/djwt`）を担う。ここ以外でパスワードやトークンの検証ロジックを書かない。

`JWT_SECRET`環境変数が無いと起動時に例外を投げて落ちる（意図的な挙動。鍵が無いまま
起動して「誰の署名も検証できないトークン」を発行し続ける事故を防ぐ）。Deploy上での
本番の鍵の管理方法（Secretsへの登録等）は別Issueで扱う。

ログインの成功・失敗で応答時間に差が出ないよう、アカウントが存在しない場合も
ダミーハッシュに対してscryptを1回計算してから401を返す（`sessions.ts`の
`DUMMY_HASH`）。ここを早期returnに書き換えない。

## AI評価・モデレーション（暫定実装）

`src/lib/aiEvaluate.ts`（AI文章評価）と`src/lib/moderation.ts`（規則ベースの
モデレーション）は、どちらも本物のAIモデル抜きの暫定実装。design_doc.md 8章
「AI評価・AI文章変換は最初は簡易ロジックで良い」という方針に基づく。

- `aiEvaluate.ts`：ひらがな比率や固定パターンの一致から月齢の目安を出す。
  `ai/`配下の本物のAI評価に差し替える際は`evaluateText()`の中身だけを
  差し替えれば良く、呼び出し側（`routes/ai.ts`、`routes/posts.ts`）は変更不要
- `moderation.ts`：`ai/moderation_rules.py`（Python側の同種の実装）を
  TypeScriptへ移植したもの。**移植元とロジックがずれたら、design_doc.md
  9.2章の確定仕様（FR-MOD-023はblock）を優先し、Python側の実装を疑う**

正規表現を文字クラス`[...]`で組み立てる際、`-`（ハイフン）は他の記号と同様に
エスケープが必要（`moderation.ts`のMASK_PATTERNで一度踏んだ不具合）。
`deno check`は正規表現の構文エラーを検出しないため、`RegExp`を動的に組み立てる
コードを変更したら、実際にサーバを起動して確認する。

## 変更したら

`deno task check`を通す。`deno check`と`deno lint`と`deno fmt --check`を
まとめて実行する。ただし`deno check`は型チェックのみで、正規表現の構文エラー
（上記）のような実行時エラーは検出しない。ローカルのPostgresでサーバを起動し、
`curl`で実際に叩いて確認する（`README.md`のローカル起動手順を参照）。
