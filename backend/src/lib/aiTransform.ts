import { checkRules } from "./moderation.ts";

/**
 * AI文章変換の簡易ルールベース実装（暫定）。
 *
 * design_doc.md 8章の方針に従い、`/api/ai/transform`のインターフェース
 * （{ action, transformedText, reasonCodes }）だけを固定し、中身は
 * 単語の置き換えによる簡易変換にしている。`ai/transform_api.py`
 * （Gemini APIによる本物の言い換え）がHTTPサービスとして呼び出せる形に
 * なったら、この関数の中身をそちらへ差し替える想定（呼び出し側の
 * routes/ai.tsは変更不要）。
 *
 * FR-AI-TRANS-002は`allow`/`rewrite_required`/`block`の3状態を求めているが、
 * この暫定実装では`rewrite_required`を返さない（`allow`/`block`の2値）。
 * 個人情報・NG語・マサカリはFR-MOD-023により`block`へ統一されており、
 * `rewrite_required`が必要になる具体的なケースが無いため。
 */
export type TransformStyle = "baby" | "mother";
export type TransformAction = "allow" | "block";

export type TransformResult = {
  readonly action: TransformAction;
  readonly transformedText: string | null;
  readonly reasonCodes: readonly string[];
};

/** 難しい言葉を幼児語に置き換える辞書。Issue #15の「言い換えのしかた」を参考にした最小限のもの。 */
const BABY_WORD_MAP: readonly (readonly [RegExp, string])[] = [
  [/調査する/g, "しらべる"],
  [/整理する/g, "おかたづけする"],
  [/発生する/g, "でちゃう"],
  [/確認する/g, "たしかめる"],
  [/完了した/g, "おわったよ"],
  [/失敗した/g, "しっぱいしちゃった"],
  [/疲れた/g, "つかれたよぉ"],
  [/大変/g, "たいへんなの"],
  [/難しい/g, "むずかしいよぉ"],
  [/眠い/g, "ねむいよぉ"],
];

function toBabyWords(text: string): string {
  let result = text;
  for (const [pattern, replacement] of BABY_WORD_MAP) {
    result = result.replace(pattern, replacement);
  }
  result = result.replace(/です[。.]?$/, "でちゅ");
  result = result.replace(/ます[。.]?$/, "まちゅ");
  result = result.replace(/だ[。.]?$/, "なの");
  if (!/[。.！!?？のちゅーぉ]$/.test(result)) {
    result += "でちゅ";
  }
  return result;
}

/** マサカリ表現をやわらげる方向の言い換えではなく、労いの言葉を添えるだけの簡易実装。 */
function toMotherWords(text: string): string {
  return `よしよし、${text}のね。だいじょうぶだよ、おつかれさま`;
}

/**
 * `POST /api/ai/transform`の中身。
 * 変換前の入力と変換後の出力の両方をモデレーションにかける（FR-MOD-001〜002）。
 */
export function transformText(
  body: string,
  style: TransformStyle,
): TransformResult {
  const before = checkRules(body);
  if (before.action === "block") {
    return {
      action: "block",
      transformedText: null,
      reasonCodes: before.reasonCodes,
    };
  }

  const transformed = style === "baby"
    ? toBabyWords(body)
    : toMotherWords(body);

  const after = checkRules(transformed);
  if (after.action === "block") {
    // 変換によって新たにNG表現が生じた場合も、変換前と同じくblockとして扱う。
    return {
      action: "block",
      transformedText: null,
      reasonCodes: after.reasonCodes,
    };
  }

  return { action: "allow", transformedText: transformed, reasonCodes: [] };
}
