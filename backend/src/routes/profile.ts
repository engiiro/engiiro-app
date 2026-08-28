// docs/design_doc.md 7.1章 GET /api/profile/me に対応する。
// 本人しか呼べないエンドポイント。赤ちゃん／お母さん両ペルソナと生年月日を
// まとめて返すのはここだけ（FR-PERSONA-005、FR-PRIV-007）。

import { query } from "../lib/db.ts";
import { resolveAccountId } from "../lib/auth.ts";
import { error, json } from "../lib/http.ts";
import type {
  AccountRow,
  BabyPersonaRow,
  MotherPersonaRow,
  PersonaAgeEstimateRow,
} from "../models/types.ts";

export async function handleGetMyProfile(req: Request): Promise<Response> {
  const accountId = await resolveAccountId(req);
  if (!accountId) return error("認証が必要です。", 401);

  // birth_dateはdate型。pgのデフォルトパーサーはJSのDateに変換してからISO文字列化するため
  // タイムゾーンの影響でYYYY-MM-DDがずれる。文字列としてそのまま取り出す。
  const accountResult = await query<AccountRow>(
    "select birth_date::text as birth_date from accounts where id = $1",
    [accountId],
  );
  const account = accountResult.rows[0];
  if (!account) return error("アカウントが見つかりません。", 404);

  const babyResult = await query<BabyPersonaRow>(
    "select id, nickname from baby_personas where account_id = $1",
    [accountId],
  );
  const motherResult = await query<MotherPersonaRow>(
    "select id, nickname from mother_personas where account_id = $1",
    [accountId],
  );
  const baby = babyResult.rows[0];
  const mother = motherResult.rows[0];

  const estimateResult = await query<PersonaAgeEstimateRow>(
    `select persona_type, persona_id, estimated_age
     from persona_age_estimates
     where (persona_type = 'baby' and persona_id = $1)
        or (persona_type = 'mother' and persona_id = $2)`,
    [baby.id, mother.id],
  );
  const babyEstimate = estimateResult.rows.find(
    (r: PersonaAgeEstimateRow) => r.persona_type === "baby",
  );
  const motherEstimate = estimateResult.rows.find(
    (r: PersonaAgeEstimateRow) => r.persona_type === "mother",
  );

  return json({
    birthDate: account.birth_date,
    babyPersona: {
      id: baby.id,
      nickname: baby.nickname,
      estimatedAge: babyEstimate?.estimated_age
        ? Number(babyEstimate.estimated_age)
        : null,
    },
    motherPersona: {
      id: mother.id,
      nickname: mother.nickname,
      estimatedAge: motherEstimate?.estimated_age
        ? Number(motherEstimate.estimated_age)
        : null,
    },
  });
}
