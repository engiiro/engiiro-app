// persona_age_estimates の更新。design_doc.md 3.4章「赤ちゃん度／お母さん度」の
// 集計値で、バブル・あやすの保存が通るたびに、そのペルソナの推定年齢を更新する。
//
// 具体的な集計アルゴリズム（単純平均か重み付けかなど）は実装フェーズで検討する
// 項目のため、ここでは「新しい評価値を既存件数で加重平均する」という素直な実装にする。

import { query } from "./db.ts";
import type { PersonaType } from "../models/types.ts";

export async function recordPersonaAgeEstimate(
  personaType: PersonaType,
  personaId: string,
  newEstimatedAge: number,
): Promise<void> {
  await query(
    `insert into persona_age_estimates (persona_type, persona_id, estimated_age, sample_count, updated_at)
     values ($1, $2, $3, 1, now())
     on conflict (persona_type, persona_id) do update
     set estimated_age = (
           (coalesce(persona_age_estimates.estimated_age, 0) * persona_age_estimates.sample_count + $3)
           / (persona_age_estimates.sample_count + 1)
         ),
         sample_count = persona_age_estimates.sample_count + 1,
         updated_at = now()`,
    [personaType, personaId, newEstimatedAge],
  );
}
