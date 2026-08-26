import { evaluateBabyMonths, evaluateMotherMonths } from "./aiEvaluate.ts";
import { query } from "./db.ts";

type BodyRow = { body: string };

/** design_doc.md 7.2章の`GET /api/profile/me`が返す`status`。 */
export type PersonaStatus = {
  readonly months: number;
  readonly label: string;
  readonly axis: string;
  readonly sampleCount: number;
};

/** 「3さい2かげつ相当」のような表示用の文言を作る。 */
function monthsToLabel(months: number): string {
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  if (years === 0) return `${remainder}かげつ相当`;
  if (remainder === 0) return `${years}さい相当`;
  return `${years}さい${remainder}かげつ相当`;
}

function computeStatus(
  texts: readonly string[],
  evaluate: (text: string) => number,
  axis: string,
): PersonaStatus {
  if (texts.length === 0) {
    // まだ材料が無い。0歳と断定せず、件数0のまま返す（NFR-002と同じ「使えない旨を伝える」考え方）。
    return { months: 0, label: "まだ わからない", axis, sampleCount: 0 };
  }
  const monthsList = texts.map(evaluate);
  const months = Math.round(
    monthsList.reduce((sum, m) => sum + m, 0) / monthsList.length,
  );
  return {
    months,
    label: monthsToLabel(months),
    axis,
    sampleCount: texts.length,
  };
}

/**
 * 赤ちゃん度（FR-PROFILE-003）。材料は本人のバブル＋赤ちゃんとしてのあやすの文章。
 * お母さんとしてのあやすだけを投稿しても、この値は変化しない。
 */
export async function babyStatus(
  babyPersonaId: string,
): Promise<PersonaStatus> {
  const postsResult = await query<BodyRow>(
    "select body from posts where baby_persona_id = $1 and deleted_at is null",
    [babyPersonaId],
  );
  const commentsResult = await query<BodyRow>(
    "select body from comments where baby_persona_id = $1 and deleted_at is null",
    [babyPersonaId],
  );
  const texts = [
    ...postsResult.rows.map((row: BodyRow) => row.body),
    ...commentsResult.rows.map((row: BodyRow) => row.body),
  ];
  return computeStatus(texts, evaluateBabyMonths, "赤ちゃん度（文章の幼さ）");
}

/**
 * お母さん度（FR-PROFILE-004）。材料は本人のお母さんとしてのあやすの文章のみ。
 * 赤ちゃんとしての投稿だけでは、この値は変化しない。
 */
export async function motherStatus(
  motherPersonaId: string,
): Promise<PersonaStatus> {
  const result = await query<BodyRow>(
    "select body from comments where mother_persona_id = $1 and deleted_at is null",
    [motherPersonaId],
  );
  const texts = result.rows.map((row: BodyRow) => row.body);
  return computeStatus(
    texts,
    evaluateMotherMonths,
    "お母さん度（向けている相手の年齢）",
  );
}
