# えんじいろ UI モック（frontend/app）

S2 タイムライン / S3 バブル作成 / S4 バブル詳細 / S5 あやすモーダル の基本 UI モック。
React + TypeScript + Vite。**データは静的ダミーで、backend には接続しない。**

正本の階層は [`../../AGENTS.md`](../../AGENTS.md) →
[`../../docs/specification.md`](../../docs/specification.md) →
[`../../docs/design_doc.md`](../../docs/design_doc.md) →
[`../../DESIGN.md`](../../DESIGN.md) の順。上が常に優先。

## 動かす

```bash
cd frontend/app
npm install
npm run dev      # http://localhost:5173
```

```bash
npm run build    # tsc -b + vite build
npm run lint     # oxlint
```

## 画面の上にある「モック操作」帯

**製品の UI ではない。** 画面の操作だけでは作れない状態を出すための足場で、
実 API に差し替えるときにこの帯ごと外す（`src/components/MockControls.tsx`）。

| つまみ | できること |
|---|---|
| テーマ | OSに従う / ノーマル / ダーク / 園児UI を切り替える |
| AI | AI 推論が停止している状態を作る（NFR-001〜003 の確認用） |
| フィード | ふつう / 読み込み中（skeleton）/ 空 を切り替える |

S3 の下端にも「block になる例」「rewrite_required になる例」というモック用のボタンがある。
入る文言は `src/data/moderationSamples.ts`。フィードには流していない。

## ファイルの置き場所

```
src/
  tokens/      3テーマの CSS 変数と、書体・動き・余白のトークン
    theme.css        ★ 色を書いてよい唯一のファイル
    typography.css   書体階層（.t-bubble-body など）
    motion.css       動きのトークンと5つの keyframes、reduced-motion
    base.css         余白・レイアウト・フォーカス・共通の地ならし
  components/  共通部品（ReactionRow / BubbleCard / SootheItem / NoteBox …）
  screens/     S2 / S3 / S4 / S5
  data/        静的ダミーデータ
    api.ts           ★ サーバとの境界。実 API 差し替え時はここだけ触る
    types.ts         ドメイン型（accountId 相当のフィールドを持たない）
    reactions.ts     ★ 対象別リアクションの唯一の定義
  lib/         mockAiTransform / mockModeration / 相対時刻 / テーマ / あやすの返信規則
```

差し替えるときに触る場所は 2 つだけ：

- **API 接続**：`src/data/api.ts` の各関数の中身を `fetch` にする。画面側は触らない
- **配色の確定**（DESIGN.md §2.2 のノーマルが未確定）：`src/tokens/theme.css` の
  素の `:root` の値。コンポーネントに hex は 1 つも無い

## 仕様のうち、UI で担保している要点

| 仕様 | どこで |
|---|---|
| 対象別リアクション（バブル・赤ちゃんあやす=3種／お母さんあやす=`ばぶー`のみ） | `data/reactions.ts` の表 → `components/ReactionRow.tsx`。画面ごとにボタンを並べ直さない |
| 「わかるわぁ」と「哺乳瓶」は同一（FR-REACT-009） | ボタン1つ。ラベル「わかるわぁ」＋哺乳瓶アイコン |
| お母さんあやすへの返信は赤ちゃんのみ（FR-COMMENT-005） | `lib/soothePersonaRule.ts`。S5 は選択肢を**出さない** |
| バブルはお母さんで投稿できない（FR-POST-003） | S3 は `disabled` で**残す**。ラベルに理由を書く。S5 とは逆 |
| 本文 150 文字（FR-POST-002 / NFR-005） | 入力は止めず、投稿ボタンだけ無効。カウンタは残り20から色が変わり、超過は負数 |
| モデレーション拒否の表示（FR-MOD-033/034） | `components/NoteBox.tsx` の `MODERATION_REJECT_TEXT`。理由コードを渡す口を作っていない |
| AI 結果を自動保存しない（FR-AI-TRANS-006） | 「これで書く」は本文欄に入れるだけ |
| AI 停止中も投稿できる（NFR-001/003） | 投稿ボタンの活性は本文の長さだけで決まる |
| ペルソナ非連結（FR-PERSONA-003/004） | ダミーデータに `accountId` 相当が無い。1画面に自分の両ペルソナを出さない |
| 存在させない UI（16章） | フォロワー数・一覧／通報／DM／URL の自動リンク化／絶対時刻を置いていない |

## 確認のしかた

`npm run dev` で開いて、モック操作帯を動かしながら見る。実装時に通した確認は次のとおり。

### 1. 3テーマ × 4画面（12通り）

375×812 の Chrome で 12 通りを目視。ダークで臙脂のボタンが地に溶けていないこと
（ダークの主ボタンは `--accent-fill` `#B54254`。臙脂 `#9B3342` は暗い地で 2.54:1 しか出ないため使わない）。

### 2. コントラスト実測

`src/tokens/theme.css` の実値から、実際に使っている 22 組 × 3テーマ = 66 組を計算し、
規約（本文 4.5:1 / 大きい文字と部品 3:1）を割るものが無いことを確認済み。
DESIGN.md §2 に載っている実測値と一致する（ダーク `accent-line` 7.40:1、
ダーク `accent-fill` の輪郭 3.34:1、園児UI `accent-line` 5.43:1）。

もっとも余裕が無いのは園児UI の次の 3 組。**配色を触るときはここから壊れる。**

| 組み合わせ | 比 |
|---|---|
| `mother` `#2E7A50` on `mother-soft` `#E4F3DC` | 4.52:1 |
| `accent-line` `#C22648` on `accent-soft` `#FFE0E6` | 4.65:1 |
| `muted` `#7A675C` on `mother-soft` `#E4F3DC` | 4.63:1 |

### 3. 375px と 960px

- 375px：横スクロールが出ない（園児UI の傾き・ずらし影を含めて）。
  バブルカードの密度は製品領域 628px に対して **2.47 枚**（目標 2.5 枚）
- 960px / 1280px：フィードは 600px のまま。左に固定ナビ 220px。横スクロールなし

### 4. キーボードだけで S2 → S4 → S5 → 送信

Tab でバブルカードに到達（フォーカスは `2px solid var(--accent-line)`）→ Enter で S4 →
Tab であやすボタン → Enter で S5（開いた直後のフォーカスは本文欄）→ 入力 → Tab で送信 → Enter。
到達・送信まで確認済み。Escape でモーダルが閉じる。

### 5. prefers-reduced-motion: reduce

移動・拡大・跳ね・ぼかしの原資になっているトークン（`--distance-*` / `--scale-modal` /
`--press-scale` / `--pop-scale` / `--blur-*`）を 0 と 1 に潰し、`--ease-bounce` を
`--ease-smooth-out` に差し替える。`opacity` と色の変化は時間そのまま残る（`--duration-fast` は 250ms のまま）。
粒子（`.eg-burst`）は等価物が無いので `display: none`。

### 6. grep での自己点検

```bash
# 色の直書き（tokens/theme.css 以外に hex / rgb / hsl が無いこと）
grep -rnE "#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(" src --include=*.css --include=*.tsx --include=*.ts \
  | grep -v "^src/tokens/theme.css"

# transition: all（コメント以外に無いこと）
grep -rn "transition:\s*all" src

# 絶対時刻の整形（無いこと。相対表示は lib/relativeTime.ts だけ）
grep -rnE "toLocale(Date|Time|)String|Intl\.DateTimeFormat" src

# accountId（コメント以外に無いこと）
grep -rni "accountid" src
```

## 既知の制限・未確定

実装しなかったこと、判断を人間に残していることの一覧。

- **S1 / S6 / S7 / S8 は対象外。** 行き先のない導線は置いていない
  （ニックネームのタップで S6 へ行く導線も、S6 が無いので作っていない）
- **スタンプ（FR-POST-005 / FR-STAMP-001）は未実装。** 発注の S3 の周辺要素に含まれておらず、
  見た目も未定（DESIGN.md §11）
- **あやす本文の文字数上限は設けていない。** 仕様に無いので勝手に決めていない
- **文字数の数え方**はコードポイント単位（`data/constants.ts`）。正式な数え方は未確定
  （design_doc §7.1 の注記）
- **`rewrite_required` で書き換え候補を返していない。** design_doc §7.1 の例では
  `transformedText` に候補を返すとあるが、DESIGN.md §4 は「使える形で出さない」。
  仕様書（FR-AI-TRANS-004）はどちらも満たせるため、厳しい側の DESIGN.md に合わせた。**人間の確認が必要**
- **`reasonCodes` を返していない。** design_doc §7.1 の応答例にはあるが、
  FR-AI-TRANS-009 と衝突するため上位文書に従った。**backend の I/F を決めるときに要確認**
- **自分のバブルへのあやすを赤ちゃんに限定している**（`lib/soothePersonaRule.ts`）。
  仕様書の制約ではなく、DESIGN.md §0.1-1「同じ画面に自分の両ペルソナを並べない」から導いた
  UI 側の判断。**人間の確認が必要**
- **意味色（`--success` / `--warning` / `--error`）と `--mother-fill` はどの画面でも未使用。**
  トークン契約（DESIGN.md §2.1）にある役割なので定義だけ置いてある。
  園児UI の意味色は DESIGN.md に値が無いため、ノーマルの値を継承している
- **園児UI の鮮やか色（`vivid-*`）はトークン化していない。** ノーマル・ダーク側に対応する値が
  DESIGN.md に無く、「メディアクエリや `[data-theme]` の中だけで定義される色を作らない」規約
  （§8.3）と両立しないため。園児UI の性格は 2px 枠・ずらし影・傾き・角丸・黄色い地で出している
- **アイコンは仮のもの**（DESIGN.md §11 でアイコンセット未定）。`components/icons.tsx` を差し替える前提
- **`Zen Maru Gothic` は Google Fonts の `<link>` で読んでいる。** セルフホストにするかは未確定（§11）
- **エラー表示の共通形式は未確定**（backend のエラー形式そのものが未確定 / Issue #8）。
  `data/api.ts` は粗い区分（`moderation` / `too_long` / `persona_not_allowed`）だけを返す
- フロントの API ベース URL 用の環境変数は、接続しないので置いていない

## モックであることの限界

- **フロント側のモデレーションと文字数チェックは、保証にはならない。**
  本番では保存時にサーバ側で必ず再検査する（FR-MOD-003/004、NFR-004）。
  `data/api.ts` の検査は「境界で弾く形」を示すためのもの
- 同じく、リアクションの組み合わせ（FR-REACT-007）とあやすの返信ペルソナ（FR-COMMENT-006）も、
  サーバ側で弾くのが本体。フロントは「そもそも出さない」を担保する側
- 再読み込みするとダミーデータは初期状態に戻る（保存先を持たない）
