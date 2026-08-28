// docs/design_doc.md 7.1章 GET /api/profile/me に対応する。
// 本人しか呼べないエンドポイント。赤ちゃん／お母さん両ペルソナと生年月日を
// まとめて返すのはここだけ（FR-PERSONA-005、FR-PRIV-007）。

import { query } from "../lib/db.ts";
import { resolveAccountId } from "../lib/auth.ts";
import {
  computeBabyDegree,
  computeMotherDegree,
} from "../lib/personaEstimate.ts";
import { error, json } from "../lib/http.ts";
import type {
  AccountRow,
  BabyPersonaRow,
  MotherPersonaRow,
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

  const [babyDegree, motherDegree] = await Promise.all([
    computeBabyDegree(baby.id),
    computeMotherDegree(mother.id),
  ]);

  return json({
    birthDate: account.birth_date,
    babyPersona: {
      id: baby.id,
      nickname: baby.nickname,
      estimatedAge: babyDegree?.estimatedAge ?? null,
    },
    motherPersona: {
      id: mother.id,
      nickname: mother.nickname,
      estimatedAge: motherDegree?.estimatedAge ?? null,
    },
  });
}
