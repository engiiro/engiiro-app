# public/data — モックデータ

画面に出しているダミーデータの置き場です（PO の指示、2026-08-26 / Issue #30）。

**JSON を書き換えて再読み込みすれば、画面の中身が変わります。** ビルドは要りません。
「この項目は要るのか」「この一覧は使うのか」を、実際に触って確かめるためのものです。

## 使い方

```bash
cd frontend/app
npm install
npm run dev
```

このディレクトリのファイルを編集してブラウザを再読み込みすると反映されます。

## ファイルと、対応する API の想定

`frontend/app/src/data/api.ts` が、ここのファイルを取りに行きます。
実 API に差し替えるときは `api.ts` の中の fetch 先を変えるだけで、画面側は触りません。

| ファイル | 対応する API | 設計書 §7 の記載 |
|---|---|---|
| `profile-me.json` | `GET /api/profile/me` | あり |
| `personas.json` | `GET /api/personas/baby/:id` / `mother/:id` | あり |
| `bubbles.json` | `GET /api/posts/feed` / `GET /api/posts/:id` | あり |
| `soothes.json` | `GET /api/posts/:id/comments` | あり |
| `stamps.json` | `GET /api/stamps` | あり |
| `follows-me.json` | `GET /api/follows/me` | あり |

### 設計書にまだ無いもの（Issue #30 の B-1 / B-2）

次の2つは、**専用のファイルを作らず、上のファイルから組み立てています。**
同じバブルを2か所に書くと、片方を消したときにもう片方に残ってしまうためです。

| 画面 | 組み立て方 | 想定している API |
|---|---|---|
| S8 / S6 の一覧の切り替え | `bubbles.json` + `soothes.json` をペルソナ id で絞る | `GET /api/profile/me/activity`、`GET /api/personas/{kind}/:id/activity` |
| 大好きの解除 | `follows-me.json` を初期値にして、画面の操作で出し入れする | `DELETE /api/follows`（設計書に無い） |

**この2つが要るかどうかが、いま確かめたいことです。**

## 書き換えるときの注意

- `authorPersonaId` は `personas.json` の `id`、または `profile-me.json` の `baby.id` / `mother.id` を指します。
  存在しない id を書くと、そのバブル・あやすは表示されません
- **時刻は「何分前か」（`minutesAgo`）だけを持ちます。** 絶対時刻は書きません。
  秒精度の時刻は、赤ちゃん側とお母さん側の投稿時刻を突き合わせて同一人物を割り出す材料になります
  （`DESIGN.md` §0.1-5）
- `reactions.counts` に入れてよい種類は、対象によって変わります（FR-REACT-003〜006）
  - バブル・赤ちゃんとしてのあやす … `ogya` / `yoshiyoshi` / `manma`
  - お母さんとしてのあやす … `babu` のみ
  - 違う組み合わせを書いても、画面には出ません
- `mine` は「自分が押した回数」で、上限は5回です（FR-REACT-010/011）
- **`accountId` に相当する項目は、どのファイルにも書きません。** 書いた時点で、
  赤ちゃんとお母さんが同じ人だと分かる形になります（FR-PERSONA-003 / FR-COMMON-005）
- 本文に URL・連絡先・待ち合わせを書くと、モデレーションの確認用データになってしまいます。
  それを試したいとき以外は書かないでください（FR-MOD-021 / OUT-008）
