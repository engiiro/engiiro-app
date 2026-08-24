# frontend

技術は **React + TypeScript + Vite** に決定しました（人間 `shitake-zense` の決定）。
Fresh は使いません（チーム決定）。

| ディレクトリ | 中身 |
|---|---|
| [`app/`](app/) | 本体。画面の実装はここに置く。まずは S2〜S5 の UI モック（静的ダミーデータ） |
| [`color-check/`](color-check/) | 配色を決めるための使い捨てページ。**UI・レイアウトを画面設計の参考にしない**（`DESIGN.md` §10.1-4） |

## はじめに読むもの

正本の階層は次のとおり。**上に書かれたものが常に優先**します。

| 順 | 文書 | 決めていること |
|---|---|---|
| 1 | [`../AGENTS.md`](../AGENTS.md) | AI エージェントの作業規則 |
| 2 | [`../docs/specification.md`](../docs/specification.md) | 何を満たすか。機能要件・受入条件の正本 |
| 3 | [`../docs/design_doc.md`](../docs/design_doc.md) | 全体設計書。§7 が API 設計 |
| 4 | [`../DESIGN.md`](../DESIGN.md) | 見た目の正本。色・書体・余白・動き・コンポーネント |

画面を作る前に **`DESIGN.md` §0「Non-Negotiables」** を読んでください。
色は必ず CSS 変数の役割名（`--canvas` `--accent-line` `--accent-fill` …）経由で参照し、直書きしません。

## 動かす

```bash
cd frontend/app
npm install
npm run dev
```

詳細と確認手順は [`app/README.md`](app/README.md)。

## backend との接続

まだ接続していません。バックエンド API の仕様は
[`../docs/design_doc.md`](../docs/design_doc.md) の 7 章「API設計」を参照してください。
接続時に触るのは `app/src/data/api.ts` だけで済むようにしてあります。

現時点で backend 側に CORS ヘッダと OPTIONS 応答がなく、別オリジンの開発サーバからは通信できません。
認証・セッションの仕組みと読み取り系 API も未確定です（Issue #7 / Issue #8）。
