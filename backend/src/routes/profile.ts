// docs/design_doc.md 7章「API設計」の
//   GET /api/profile/me
// に対応する実装。

import { resolveAccountId } from "../lib/auth.ts";
import { query } from "../lib/db.ts";
import { error, json } from "../lib/http.ts";
import { babyStatus, motherStatus } from "../lib/personaStatus.ts";

async function countFollowing(
  accountId: string,
  kind: "baby" | "mother",
): Promise<number> {
  const result = await query<{ count: string }>(
    "select count(*) as count from follows where follower_account_id = $1 and target_persona_type = $2",
    [accountId, kind],
  );
  return Number(result.rows[0].count);
}

/**
 * `GET /api/profile/me`。両ペルソナのステータス・生年月日・フォロー中の数を
 * まとめて返す唯一の口（FR-PERSONA-005、FR-PRIV-007）。
 */
export async function handleGetMyProfile(req: Request): Promise<Response> {
  const accountId = await resolveAccountId(req);
  if (!accountId) {
    return error("認証が必要です", 401);
  }

  // pgのデフォルト型パーサーはdate型をJSのDateへ変換し、JSON化するとタイムスタンプに
  // なってしまう（design_doc.md 7.2章はYYYY-MM-DDの文字列を期待）。SQL側で文字列化する。
  const accountResult = await query<{ birth_date: string }>(
    "select to_char(birth_date, 'YYYY-MM-DD') as birth_date from accounts where id = $1",
    [accountId],
  );
  const babyResult = await query<{ id: string; nickname: string }>(
    "select id, nickname from baby_personas where account_id = $1",
    [accountId],
  );
  const motherResult = await query<{ id: string; nickname: string }>(
    "select id, nickname from mother_personas where account_id = $1",
    [accountId],
  );
  const baby = babyResult.rows[0];
  const mother = motherResult.rows[0];
  if (!baby || !mother) {
    return error("アカウントの状態を確認できません", 500);
  }

  const [babyStat, motherStat, followingBabyCount, followingMotherCount] =
    await Promise.all([
      babyStatus(baby.id),
      motherStatus(mother.id),
      countFollowing(accountId, "baby"),
      countFollowing(accountId, "mother"),
    ]);

  return json({
    baby: {
      persona: { id: baby.id, kind: "baby", nickname: baby.nickname },
      status: babyStat,
    },
    mother: {
      persona: { id: mother.id, kind: "mother", nickname: mother.nickname },
      status: motherStat,
    },
    birthDate: accountResult.rows[0].birth_date,
    followingBabyCount,
    followingMotherCount,
  });
}
