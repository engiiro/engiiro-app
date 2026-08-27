# ai/ — AI推論サービス

「えんじいろ」の`POST /api/ai/evaluate`（文章の年齢評価）と`POST /api/ai/transform`
（赤ちゃん語・お母さん語への文章変換）を提供するFastAPIサービスです。
`docs/design_doc.md` 7章のAPI契約を実装します。

このファイルは2026-08-27に、AI文章変換（`/transform`）の実装に合わせて全面的に
書き直しました。以前のバージョンはGemma/PyTorchの速度比較実験の説明でしたが、
現在のコードとは一致していないため置き換えています。

## 1. このディレクトリでできること

| エンドポイント | 内容 | 担当・詳細設計 |
|---|---|---|
| `GET /health` | ヘルスチェック | - |
| `POST /api/ai/evaluate`相当（`/evaluate`） | 文章から推定年齢を返す | `ai/src/evaluate.py`。Issue #36 |
| `POST /api/ai/transform`相当（`/transform`） | 文章を赤ちゃん語・お母さん語へ変換する | 本README、`docs/ai_transform_design.md` |
| （投稿可否の判定） | `ai/moderation_rules.py`の`check_rules()` | `/transform`の内部でのみ使用。単独のHTTPエンドポイントは無い |

`/evaluate`（文章の年齢評価）は本READMEの対象外です。実装は`ai/src/evaluate.py`
にあり、Issue #36の担当領域なのでここでは触れません。

## 2. AI文章変換（`/transform`）の仕組み

詳細設計は`docs/ai_transform_design.md`を参照してください。ここでは要点だけ書きます。

### 2.1 なぜ2段構えなのか

変換は2つの経路を持ちます。

1. **一次経路：Gemini API**（`ai/transform_api.py`）。文脈を理解した自然な言い換え
   ができますが、外部APIなので遅延・エラー・レート制限が起こり得ます。
2. **フォールバック経路：ルールベース変換**（`ai/src/fallback/`）。外部通信を
   一切せず、辞書と正規表現だけで変換します。Gemini APIが遅い・止まっている
   ときに自動で切り替わります。

利用者からもバックエンドからも、どちらの経路で変換されたかは見えません
（レスポンスの形は`{ action, transformedText, reasonCodes }`で共通）。

### 2.2 処理の流れ

```
POST /transform { body, style }
  │
  ├─ 1. NGワードの端処理（マサカリ寄りの語を穏当な表現へ機械的に置換）
  ├─ 2. 事前モデレーション（個人情報・自傷他害等はここで block）
  ├─ 3. Gemini APIで変換を試みる（既定4秒でタイムアウト）
  │      失敗・タイムアウト → ルールベースのフォールバックへ切り替え
  ├─ 4. 事後モデレーション（変換後の文章も検査する）
  └─ 5. { action: "allow", transformedText, reasonCodes: [] }
```

`action`は`allow`/`block`の2値です（`docs/design_doc.md` 9.2章、FR-MOD-023に
統一。以前の7章の記載は`allow`/`rewrite_required`/`block`の3値でしたが、
9.2章と矛盾していたため2026-08-27に2値へ揃えました）。

### 2.3 フォールバック変換の中身（辞書と正規表現）

`ai/dictionaries/`にJSON辞書、`ai/src/fallback/`に変換ロジックがあります。

- `baby_category_words.json`：複数の単語を1つの赤ちゃん語へまとめる辞書
  （例：「オムライス」も「カツカレー」も「まんま」。「セダン」等の一般的な車は
  「ぶーぶー」、「救急車」「パトカー」「消防車」のような緊急車両は
  「ぴーぽーぴーぽー」と、車カテゴリを2つに分けています）
- `baby_engineer_words.json`：エンジニアが日常的に使う語の辞書。同じ意味
  グループの類義語をまとめて1つの赤ちゃん語へ寄せるサブカテゴリ化にしています
  （例：「お約束」「仕様書」「規約」→「おやくそくのかみ」、「バグ」「エラー」
  「障害」→「ばぐばぐ」）。「えんじいろ」の利用者はエンジニアが中心という
  前提で、ここを重点的に育てています
- `harsh_word_softeners.json`：NGワードの端処理用の辞書（1対1、カテゴリ化
  しない。例：「無能」→「まだ慣れていない」）。投稿を`block`するほどでは
  ないマサカリ寄りの語を、変換前に穏当化します
- `dictionary_loader.py`：上記のJSON辞書を読み込む共通ロジック。カテゴリ辞書
  （`{カテゴリ語: [対応語, ...]}`）を`{対応語: カテゴリ語}`のフラットな
  置換辞書へ変換する`load_category_dictionary()`と、1対1の辞書をそのまま
  読み込む`load_flat_dictionary()`がある
- `dictionary_match.py`：上記の辞書を「最長一致」で置換する共通ロジック。
  形態素解析（fugashi）だけだと「自動車」が「自動」+「車」に割れてしまう
  問題を、原文の文字列に対する辞書引きで回避しています（詳しくはこの
  ファイルのdocstring、および`docs/ai_transform_design.md` 6.3章）
- `sentence_split.py`：複数の文からなる入力を句点・感嘆符・疑問符で分割する
  共通ロジック
- `baby_fallback.py` / `mother_fallback.py`：上記を組み合わせて、実際の変換を
  行う本体

辞書は最初から全部の語を網羅していません。「よく使う語を重点的に育てる」
前提です。新しい語を追加する場合は7章「辞書の育て方」を読んでください。

### 2.4 NGワードの端処理と、投稿可否のモデレーションの違い

どちらも`ai/moderation_rules.py`の語彙・仕組みと関係していますが、レイヤーが
違います。

| | 何をするか | どこで判定するか |
|---|---|---|
| 投稿可否のモデレーション（`check_rules`、既存） | 個人情報・自傷他害・露骨なNG語を`block`にする。**置き換えない** | `/transform`の変換前・変換後 |
| NGワードの端処理（`harsh_word_softeners.py`、今回追加） | `block`ほど重篤ではないマサカリ寄りの語を、**投稿を止めずに**穏当な表現へ機械的に置換する | `/transform`の変換に入る前 |

`block`にする語のリスト（`NG_WORDS_BLOCK`・`SELF_HARM_WORDS`）は今回変更して
いません。

## 3. ディレクトリ構成

```
ai/
├── app.py                          FastAPIアプリ本体。/health /evaluate /transform
├── requirements.txt                  依存パッケージ
├── moderation_rules.py               投稿可否のモデレーション（NG辞書・個人情報検出）
├── transform_api.py                  Gemini APIクライアント（CLIとしても実行可能）
├── transform_colab.ipynb             Gemini呼び出しをColabで試すためのノートブック
├── src/
│   ├── evaluate.py                    文章の年齢評価（Issue #36の担当領域）
│   ├── transform.py                   /transform の本体。Gemini→フォールバックの制御
│   └── fallback/
│       ├── dictionary_loader.py         JSON辞書の読み込み・フラット化
│       ├── dictionary_match.py          辞書の最長一致置換
│       ├── sentence_split.py            文単位への分割
│       ├── baby_fallback.py             赤ちゃん語のルールベース変換
│       └── mother_fallback.py           お母さん語のルールベース変換
├── dictionaries/
│   ├── baby_category_words.json       カテゴリ辞書（食事・車・緊急車両・眠り等）
│   ├── baby_engineer_words.json       エンジニア用語辞書（サブカテゴリ化）
│   └── harsh_word_softeners.json      NGワードの端処理用の辞書
└── tests/
    ├── test_environment.py            開発環境の依存関係スモークテスト
    ├── test_moderation_rules.py       投稿可否のモデレーションのテスト
    └── test_fallback_transform.py     AI文章変換（本README対象）のテスト
```

## 4. セットアップ

Python 3.11以上を想定しています（`Dockerfile`が`python:3.11-slim`を使うため）。

```sh
cd ai

# 仮想環境を作る（1回だけ）
python3 -m venv .venv

# 仮想環境を有効化する
source .venv/bin/activate   # Windows の場合は .venv\Scripts\activate

# 依存パッケージをインストールする
pip install -r requirements.txt
```

Gemini APIを使う場合は、環境変数`GOOGLE_API_KEY`を設定してください
（[Google AI Studio](https://aistudio.google.com/app/apikey)で取得）。
**設定しなくても、フォールバック経路だけでサーバーは動きます**（`GOOGLE_API_KEY`
未設定は6.1章の想定どおり、フォールバックの発動条件の1つです）。

## 5. 動かし方

### 5-1. サーバーを立てて、API として使ってみる

```sh
uvicorn app:app --host 127.0.0.1 --port 8001
```

```sh
curl -X POST http://127.0.0.1:8001/transform \
  -H "Content-Type: application/json" \
  -d '{"body": "お約束を破ってしまいました。", "style": "baby"}'
```

```json
{"action": "allow", "transformedText": "おやくそくのかみを破ってしまいたのー。", "reasonCodes": []}
```

`http://127.0.0.1:8001/docs`でSwagger UIから対話的に試せます。

### 5-2. 各ファイルを直接実行して、仕組みを1つずつ確認する

`ai/src/fallback/`配下と`ai/src/transform.py`は、それぞれ単体で実行すると
動作確認ができます（`if __name__ == "__main__":`）。`ai/`ディレクトリを
起点にして、モジュールとして実行してください（相対インポートを解決するため）。

```sh
# 辞書の最長一致置換だけを試す
python -m src.fallback.dictionary_match

# 赤ちゃん語のフォールバック変換だけを試す
python -m src.fallback.baby_fallback

# お母さん語のフォールバック変換だけを試す
python -m src.fallback.mother_fallback

# Gemini→フォールバックを含めた全体を試す（GOOGLE_API_KEY が無くても動く）
python -m src.transform
```

### 5-3. Python のコードから直接関数として呼び出す

```python
from src.transform import transform

result = transform("お約束を破ってしまいました。", "baby")
print(result)
# {"action": "allow", "transformedText": "おやくそくのかみを破ってしまいたのー。", "reasonCodes": []}
```

### 5-4. テストを実行する

```sh
python -m pytest tests/ -v
```

`GOOGLE_API_KEY`を設定しなくても全テストが通ります（Gemini呼び出しは
`unittest.mock`でモックしています）。

## 6. 環境変数

| 変数名 | 既定値 | 内容 |
|---|---|---|
| `GOOGLE_API_KEY` | なし | Gemini APIキー。未設定でもフォールバック経路のみでサーバーは動く |
| `AI_TRANSFORM_TIMEOUT_SECONDS` | `4.0` | Gemini API呼び出しの待機上限（秒）。超えたらフォールバックへ切り替える |

## 7. 辞書の育て方

`ai/dictionaries/`の各ファイルはJSONです。`_comment`キーに辞書全体の説明を
書いています（JSON自体にコメント構文が無いため）。

### 7.1 カテゴリ辞書（`baby_category_words.json` / `baby_engineer_words.json`）への追加

これらは`{カテゴリ語（赤ちゃん語）: [対応語, ...]}`という多対1の形です。
新しい語を追加する場合：

1. 対象のカテゴリ（例：「まんま」「ばぐばぐ」）を決める。当てはまる
   カテゴリが無ければ、新しいカテゴリ語を1つ考えて追加する
2. そのカテゴリの配列に、対応語を追加する。**意味が変わらないか**
   （例：「セダン」は車だが「サーバー」は車ではない）、**技術用語・製品名・
   数値をひらがな化していないか**（「React.js」「index.ts」等はどの辞書にも
   入れない）を確認する
3. 同じ単語を複数のカテゴリへ重複登録しない（`dictionary_loader.py`は後勝ちで
   上書きするため、意図しないカテゴリに寄ってしまう）
4. 数が多い場合は`ai/tests/test_fallback_transform.py`へ代表的な数件だけ
   回帰テストを足せば十分（全語をテストする必要はない）

どんな語が実際に使われているか分からない場合は、Web検索で実在するメニュー名・
車種名・IT用語などを調べてから追加してください。**思いつきで作った語より、
実在する語彙のほうが変換の網羅率が上がります。**

### 7.2 NGワード置換辞書（`harsh_word_softeners.json`）への追加

こちらは1対1（`{語: 置換後の語}`）です。`block`にする語（`ai/moderation_rules.py`
の`NG_WORDS_BLOCK`・`SELF_HARM_WORDS`）とは別物なので、追加する前に
「文脈次第では技術的な指摘としても使われる語か」「自傷・他害・差別・個人情報の
ように文脈によらず投稿させるべきでない語か」を見極めてください（後者は
`harsh_word_softeners.json`ではなく`ai/moderation_rules.py`側に追加する）。

## 8. 責務の境界

このREADMEが説明する範囲は、`/transform`（Gemini + フォールバック変換）と
`/evaluate`・投稿可否モデレーションとの関係だけです。次は本READMEの対象外です。

- 投稿可否のモデレーションそのもの（`ai/moderation_rules.py`の中身）
- 文章の年齢評価（`ai/src/evaluate.py`、Issue #36）
- 文体の点数化・学習データに基づく分類（`naive-bayes-sample`のような別の
  取り組みで扱う想定）
- バックエンド（`backend/`）・フロントエンド（`frontend/`）との実際の接続
