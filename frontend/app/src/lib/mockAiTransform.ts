import type { PersonaKind } from "../data/types";
import { containsHarshExpression, moderate } from "./mockModeration";

/*
 * 偽の AI 文章変換（POST /api/ai/transform の代わり）。
 *
 * ai/src/transform.py と同じく、中身は差し替え前提のプレースホルダー。
 * 守っているのは形だけ：
 *   FR-AI-TRANS-002  allow / rewrite_required / block の3状態を返す
 *   FR-AI-TRANS-005  block では利用可能な変換文を返さない
 *   FR-AI-TRANS-006  変換しただけでは保存しない（保存はこの関数の外の仕事）
 *   FR-AI-TRANS-009  応答に判定の内部情報を含めない
 *   FR-MOD-001       変換前の入力を検査する
 *   FR-MOD-002       変換後の出力を検査する
 *
 * 型の上でも内部情報を持てないようにしてある。reasonCodes は返さない。
 * （docs/design_doc.md §7.1 の例には reasonCodes があるが、FR-AI-TRANS-009 と衝突するため
 *   上位文書である docs/specification.md に従った。README の「既知の制限」に記録してある）
 */

export type AiTransformResult =
  | { readonly action: "allow"; readonly transformedText: string }
  | { readonly action: "rewrite_required" }
  | { readonly action: "block" };

/** AI が止まっているときに投げる。投稿とあやすは止めない（NFR-001） */
export class AiUnavailableError extends Error {
  constructor() {
    super("ai unavailable");
    this.name = "AiUnavailableError";
  }
}

const MOCK_THINKING_MS = 900;

export async function mockAiTransform(
  text: string,
  style: PersonaKind,
  options: { readonly available: boolean },
): Promise<AiTransformResult> {
  if (!options.available) {
    throw new AiUnavailableError();
  }
  await new Promise((resolve) => {
    setTimeout(resolve, MOCK_THINKING_MS);
  });

  // FR-MOD-001：変換前の入力を検査する。ここで止まったら変換文は作らない
  if (moderate(text) === "violation") {
    return { action: "block" };
  }

  // FR-MOD-023：攻撃的な表現は、そのままでは利用させない。
  // 書き換え候補を返さないのは DESIGN.md §4「使える形で出さない」に合わせている
  if (containsHarshExpression(text)) {
    return { action: "rewrite_required" };
  }

  const transformedText = style === "mother" ? toMotherTalk(text) : toBabyTalk(text);

  // FR-MOD-002：変換で違反が生じた場合も利用可能な変換文を返さない
  if (moderate(transformedText) === "violation") {
    return { action: "block" };
  }

  return { action: "allow", transformedText };
}

/** 赤ちゃん言葉。規則ベースの仮実装 */
function toBabyTalk(text: string): string {
  const body = text
    .trim()
    .replace(/でした。/g, "だったのぉ。")
    .replace(/します。/g, "するのぉ。")
    .replace(/ました。/g, "たのぉ。")
    .replace(/です。/g, "なのぉ。")
    .replace(/ます。/g, "るのぉ。")
    .replace(/疲れた/g, "つかれちゃった")
    .replace(/つらい/g, "つらいよぉ")
    .replace(/わからない/g, "わかんないよぉ")
    .replace(/ねむい/g, "ねむねむ")
    .replace(/だ。/g, "だもん。");
  return "ぶーっ。" + body + " …だっこして。";
}

/** お母さん言葉。規則ベースの仮実装 */
function toMotherTalk(text: string): string {
  const body = text
    .trim()
    .replace(/つらい/g, "つらかったね")
    .replace(/疲れた/g, "よくがんばったね")
    .replace(/わからない/g, "まだ わからなくていいよ");
  return "よしよし。" + body + " ここまで来たの、じゅうぶん えらいよ。";
}
