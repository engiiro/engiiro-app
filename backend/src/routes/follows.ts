// docs/design_doc.md 7章「API設計」の
//   POST /api/follows
//   GET  /api/follows/me
// に対応する。フォロワー一覧・人数を返すAPIは意図的に提供しない（FR-FOLLOW-004〜005）。

import { query } from "../lib/db.ts";
import { resolveAccountId } from "../lib/auth.ts";
import { error, json, readJson } from "../lib/http.ts";

interface FollowTargetRow {
  target_persona_type: string;
  target_persona_id: string;
}

export async function handleCreateFollow(req: Request): Promise<Response> {
  const accountId = await resolveAccountId(req);
  if (!accountId) return error("認証が必要です。", 401);

  const body = await readJson(req);
  if (!body) return error("リクエストの形式が正しくありません。", 400);

  const targetPersonaType = body.targetPersonaType;
  const targetPersonaId = body.targetPersonaId;
  if (
    (targetPersonaType !== "baby" && targetPersonaType !== "mother") ||
    typeof targetPersonaId !== "string"
  ) {
    return error("targetPersonaTypeとtargetPersonaIdを指定してください。", 400);
  }

  try {
    const result = await query<{ created_at: string }>(
      `insert into follows (follower_account_id, target_persona_type, target_persona_id)
       values ($1, $2, $3)
       on conflict (follower_account_id, target_persona_type, target_persona_id)
       do update set target_persona_type = excluded.target_persona_type
       returning created_at`,
      [accountId, targetPersonaType, targetPersonaId],
    );
    return json({ createdAt: result.rows[0].created_at }, 201);
  } catch (err) {
    console.error("[follows] create failed:", err);
    return error("フォローに失敗しました。", 500);
  }
}

// design_doc.mdの7章には明記が無いが、フォローを解除する操作自体は必要なため、
// POST /api/followsと対になる形でDELETEを用意する（実装フェーズの補完）。
export async function handleDeleteFollow(req: Request): Promise<Response> {
  const accountId = await resolveAccountId(req);
  if (!accountId) return error("認証が必要です。", 401);

  const body = await readJson(req);
  if (!body) return error("リクエストの形式が正しくありません。", 400);

  const targetPersonaType = body.targetPersonaType;
  const targetPersonaId = body.targetPersonaId;
  if (
    (targetPersonaType !== "baby" && targetPersonaType !== "mother") ||
    typeof targetPersonaId !== "string"
  ) {
    return error("targetPersonaTypeとtargetPersonaIdを指定してください。", 400);
  }

  await query(
    `delete from follows
     where follower_account_id = $1 and target_persona_type = $2 and target_persona_id = $3`,
    [accountId, targetPersonaType, targetPersonaId],
  );

  return new Response(null, { status: 204 });
}

export async function handleListMyFollows(req: Request): Promise<Response> {
  const accountId = await resolveAccountId(req);
  if (!accountId) return error("認証が必要です。", 401);

  const result = await query<FollowTargetRow>(
    "select target_persona_type, target_persona_id from follows where follower_account_id = $1",
    [accountId],
  );

  return json({
    followingBabies: result.rows
      .filter((r: FollowTargetRow) => r.target_persona_type === "baby")
      .map((r: FollowTargetRow) => ({ babyPersonaId: r.target_persona_id })),
    followingMothers: result.rows
      .filter((r: FollowTargetRow) => r.target_persona_type === "mother")
      .map((r: FollowTargetRow) => ({ motherPersonaId: r.target_persona_id })),
  });
}
