# AI API 仕様書 Draft v0.2

## 文書冒頭

| 項目 | 内容 |
|---|---|
| **文書名と版** | AI API 仕様書 Draft v0.2 |
| **対象** | AI 文章評価・文章変換・モデレーション連携 |
| **読者** | フロントエンド担当、Denoバックエンド担当、Python/AI担当、レビュー担当、人間監督 |
| **全体設計書との関係** | 本仕様書は、`docs/design_doc.md` の 7 章「API設計」を詳細化したもの。Deno公開APIと Python推論サービスの責務境界、入出力、モデレーション、認証、エラー処理を定義。 |
| **確定事項とTBDの区別** | **[確定]** は人間監督が決定した内容。**[提案]** は取る可能性がある案。**[TBD]** は今後決めるべき項目。 |
| **正本** | **PR #10 未マージ時点では「正本候補」**。GitHub `main` ブランチへマージ後が正本。Notion はミラー（同期は事後）。 |

---

## 1. 目的・スコープ・非スコープ

### 1.1 目的

Deno公開API、Python推論サービス、フロントエンドの3者が同じ契約を読み、実装と統合に進むための詳細仕様を定義する。

**完了条件：** フロント担当が読んで API 呼び出しをモック実装できる、Deno 担当が AI サービスとの連携ロジックを実装できる状態。

### 1.2 スコープ（対象）

以下の2エンドポイントと責務境界：

- **`POST /api/ai/evaluate`** … 文章の「赤ちゃん度／お母さん度」を年齢値で評価する
- **`POST /api/ai/transform`** … 文章を赤ちゃん言葉・お母さん言葉に変換してモデレーション結果を返す
- **責務境界** … Deno側で行う処理、Python側で行う処理、Deno側のモデレーション前後

入力値の検証、エラー処理、認証、タイムアウト対策、ログポリシー、フロント側の画面処理も含む。

### 1.3 非スコープ（対象外）

- 投稿・コメント・プロフィール等、AI以外のすべてのAPI詳細
- モデル学習コード（学習済みモデルの推論のみが対象）
- 学習データ生成手順の詳細
- UIデザイン
- 実装コード（インターフェース定義のみ）

---

## 2. システム境界

```
Frontend
  ↓ HTTP
Deno Public API
  - 利用者認証
  - 入力検証・サイズ制限
  - レート制限・タイムアウト
  - モデレーション（前後2回）
  ↓ HTTPS (Service Auth)
Python / Hugging Face
  - 文章評価（scikit-learn）
  - 文章変換（ルールベース）
```

**重要な原則：**
- フロントは Hugging Face を直接呼ばない
- Deno は利用者認証、入力上限、レート制限、タイムアウトを担当
- Python は文章評価・変換に集中し、DB や利用者情報を扱わない
- Python は `accountId`、`personaId`、利用者トークンを受け取らない

---

## 3. 確定事項一覧

| # | 事項 | 確定内容 |
|---|---|---|
| **F-1** | エンドポイント分離 | `evaluate` と `transform` は別エンドポイント |
| **F-2** | Sprint 1 優先度 | `baby` を優先しつつ、`baby`/`mother` 両方を対象 |
| **F-3** | 利用者情報の非転送 | Python へ `accountId`、`personaId`、利用者トークン、DBキーを渡さない |
| **F-4** | AI結果の自動保存禁止 | AI結果は投稿・コメントを自動保存しない |
| **F-5** | 150文字制限 | 最終的に保存されるバブル本文は150文字以内 |
| **F-6** | 空文字列の扱い | スタンプだけの投稿では Deno から `evaluate` を呼ばない |
| **F-7** | モデレーション 2回 | `transform` は変換**前後**で計2回 |
| **F-8** | 変換契約（採用済み） | `action` (allow/rewrite_required/block) + `transformedText` + `reasonCodes[]` |

---

## 4. `POST /api/ai/evaluate`

### 4.1 目的

投稿・コメントの文章から「何歳児相当の赤ちゃん/お母さんらしさか」を年齢値で評価。

### 4.2 リクエスト仕様

```json
{
  "body": "string（1文字以上。空文字列は不可）",
  "personaType": "baby | mother"
}
```

### 4.3 レスポンス仕様

```json
{
  "estimatedAge": 2.5
}
```

- `estimatedAge` は数値（float）
- 範囲・刻み：**[TBD]** （提案：0.5 ～ 6.0 の範囲、0.5 刻み）

### 4.4 成功例

```json
{
  "body": "あああ今日つかれた。ねむい。",
  "personaType": "baby"
}
{
  "estimatedAge": 2.0
}
```

---

## 5. `POST /api/ai/transform`

### 5.1 目的

ユーザーが書いた文章を「赤ちゃん言葉」または「お母さん言葉」に変換。

### 5.2 リクエスト仕様

```json
{
  "body": "string（変換対象の原文）",
  "style": "baby | mother"
}
```

### 5.3 レスポンス仕様（採用済み契約）

```json
{
  "action": "allow | rewrite_required | block",
  "transformedText": "string | null",
  "reasonCodes": ["string"]
}
```

**意味：**
- **`allow`**：利用可能な変換候補
- **`rewrite_required`**：原文のままでは利用不可。優しい書き換え案を返す
- **`block`**：安全に提示できる変換がない
- **`reasonCodes`**：判定理由を表すコード配列

### 5.4 成功例（3パターン）

```json
{
  "action": "allow",
  "transformedText": "きょうのこーどれびゅー、つかれちゃった。",
  "reasonCodes": []
}

{
  "action": "rewrite_required",
  "transformedText": "お仕事大変だったんだね。ゆっくり休んでね。",
  "reasonCodes": ["harsh_language_toward_others（仮）"]
}

{
  "action": "block",
  "transformedText": null,
  "reasonCodes": ["hate_speech（仮）"]
}
```

---

## 6. モデレーション処理フロー

```
[1] JSON・型・列挙値・入力サイズ検証 (Deno)
[2] 表示用原文を保持したまま、検査用文字列を正規化
[3] 変換前の共通NG・文脈判定
[4] style=mother では「マサカリ表現」も判定
[5] 必要なら transform せず block / rewrite_required を返す
[6] 文章変換実行
[7] 出力の型・サイズ検証
[8] 変換結果を再正規化して再検査
[9] allow / rewrite_required / block を返す
[10] フロント：プレビュー確認
[11] 投稿・コメント保存時、Deno が改めて再検査
```

---

## 7. TBD・人間判断一覧

| # | 項目 | 提案 | 決定者 | ブロック |
|---|---|---|---|---|
| **TBD-1** | `estimatedAge` 範囲・刻み | 0.5～6.0、0.5刻み | AI担当 + PO | 高 |
| **TBD-2** | AIプレビュー入力上限 | 5000文字 | AI担当 | 中 |
| **TBD-3** | コメント文字数上限 | 300文字 | PO | 中 |
| **TBD-4** | `reasonCodes` 正式一覧 | 別仕様書で詳細化 | AI + セキュリティ | 高 |
| **TBD-5** | Deno→Python認証方式 | 共有シークレット vs. HF API キー | AI + Infra | 高 |
| **TBD-6** | 停止時フォールバック | fail-closed（推奨） | PO + AI | 中 |

---

## 8. 参照文書

- `docs/design_doc.md` … 全体設計書（正本）
- `akatonboboonboon/Codex-Claude-ChatGPT` Issue #4 … AI三者の議論

---

**本仕様書の正本：GitHub `engiiro/engiiro-app` の `main` ブランチ。**
