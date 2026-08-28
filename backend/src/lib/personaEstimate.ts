// 「赤ちゃん度・お母さん度」（推定年齢）の算出。design_doc.md 3.4章。
//
// 人間監督の決定（2026-08-28）：
//   「直近15件の投稿・あやすの推定値（ai/src/style_classifier.pyのナイーブベイズ
//   判定を月齢へ換算したもの、posts/comments.estimated_age列）の平均」と
//   「全件のうちリアクション合計数が多い上位15件の推定値の平均」を1:1で
//   平均したものを、そのペルソナの推定年齢とする。
//
// 以前はpersona_age_estimatesテーブルに投稿のたびの値を累積平均で溜め込んでいたが、
// リアクションは投稿後に増えていくため、保存時に1回だけ計算する方式では
// リアクション数を反映できない。表示のたびにこの2つの平均を計算し直す方式にした。

import { query } from "./db.ts";
import type { PersonaType } from "../models/types.ts";

interface EstimatedAgeRow {
  id: string;
  estimated_age: string; // numeric型はpgがstringで返す
}

export interface PersonaDegreeResult {
  /** 何歳相当か（0〜6の実数）。ai/src/evaluate.pyのestimatedAgeと同じ単位。 */
  estimatedAge: number;
  /** 算出のもとにした投稿・あやすの件数（直近15件・上位15件の重複を除いた実数）。 */
  sampleCount: number;
}

const RECENT_LIMIT = 15;
const TOP_REACTED_LIMIT = 15;

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

async function recentEstimatedAges(
  table: "posts" | "comments",
  personaColumn: string,
  personaId: string,
  extraWhere: string,
): Promise<EstimatedAgeRow[]> {
  const result = await query<EstimatedAgeRow>(
    `select id, estimated_age from ${table}
     where ${personaColumn} = $1 and deleted_at is null and estimated_age is not null ${extraWhere}
     order by created_at desc
     limit ${RECENT_LIMIT}`,
    [personaId],
  );
  return result.rows;
}

async function topReactedEstimatedAges(
  table: "posts" | "comments",
  personaColumn: string,
  personaId: string,
  reactionTargetType: "post" | "comment",
  reactionTargetColumn: string,
  extraWhere: string,
): Promise<EstimatedAgeRow[]> {
  const result = await query<EstimatedAgeRow>(
    `select t.id, t.estimated_age
     from ${table} t
     left join reactions r
       on r.target_type = '${reactionTargetType}' and r.${reactionTargetColumn} = t.id
     where t.${personaColumn} = $1 and t.deleted_at is null and t.estimated_age is not null ${extraWhere}
     group by t.id, t.estimated_age, t.created_at
     order by count(r.id) desc, t.created_at desc
     limit ${TOP_REACTED_LIMIT}`,
    [personaId],
  );
  return result.rows;
}

/**
 * 赤ちゃんペルソナの「赤ちゃん度」（バブルの推定値から算出）。
 * 材料が1件も無ければnull（NFR-002：使える材料が無ければ判定不能として扱う）。
 */
export async function computeBabyDegree(
  babyPersonaId: string,
): Promise<PersonaDegreeResult | null> {
  const [recent, topReacted] = await Promise.all([
    recentEstimatedAges("posts", "baby_persona_id", babyPersonaId, ""),
    topReactedEstimatedAges(
      "posts",
      "baby_persona_id",
      babyPersonaId,
      "post",
      "target_post_id",
      "",
    ),
  ]);
  return combine(recent, topReacted);
}

/**
 * お母さんペルソナの「お母さん度」（お母さんとしてのあやすの推定値から算出）。
 */
export async function computeMotherDegree(
  motherPersonaId: string,
): Promise<PersonaDegreeResult | null> {
  const extraWhere = "and persona_type = 'mother'";
  const [recent, topReacted] = await Promise.all([
    recentEstimatedAges(
      "comments",
      "mother_persona_id",
      motherPersonaId,
      extraWhere,
    ),
    topReactedEstimatedAges(
      "comments",
      "mother_persona_id",
      motherPersonaId,
      "comment",
      "target_comment_id",
      extraWhere,
    ),
  ]);
  return combine(recent, topReacted);
}

function combine(
  recent: readonly EstimatedAgeRow[],
  topReacted: readonly EstimatedAgeRow[],
): PersonaDegreeResult | null {
  const recentValues = recent.map((r) => Number(r.estimated_age));
  const topValues = topReacted.map((r) => Number(r.estimated_age));
  const recentAvg = average(recentValues);
  const topAvg = average(topValues);
  if (recentAvg === null && topAvg === null) return null;

  // 片方しか材料が無い場合はそちらだけを使う（1:1平均の相手がいないため）。
  const estimatedAge = recentAvg !== null && topAvg !== null
    ? (recentAvg + topAvg) / 2
    : (recentAvg ?? topAvg)!;

  const distinctIds = new Set([...recent, ...topReacted].map((r) => r.id));
  return {
    estimatedAge: Math.round(estimatedAge * 10) / 10,
    sampleCount: distinctIds.size,
  };
}

export function degreeFor(
  personaType: PersonaType,
  personaId: string,
): Promise<PersonaDegreeResult | null> {
  return personaType === "baby"
    ? computeBabyDegree(personaId)
    : computeMotherDegree(personaId);
}
