// docs/design_doc.md 7章「API設計」の
//   POST   /api/follows
//   DELETE /api/follows
//   GET    /api/follows/me
// に対応する実装。

import { resolveAccountId } from "../lib/auth.ts";
import { query } from "../lib/db.ts";
import { error, json, readJson } from "../lib/http.ts";

type PersonaKind = "baby" | "mother";

function isPersonaKind(value: unknown): value is PersonaKind {
  return value === "baby" || value === "mother";
}

function personaTable(kind: PersonaKind): "baby_personas" | "mother_personas" {
  return kind === "baby" ? "baby_personas" : "mother_personas";
}

/**
 * `POST /api/follows`。ペルソナ単位・一方向のフォロー（FR-FOLLOW-001〜002）。
 * 自分自身のペルソナはフォローできない（フロントエンド側の先行実装に合わせた。
 * design_doc.md 10章のオープンイシューと同様、要否は改めてPO確認が必要）。
 *
 * 既にフォロー済みの相手への要求は、エラーにせず現在のフォロー日時を返す
 * （べき等。UNIQUE制約に対して`on conflict ... do update`で対応する）。
 */
export async function handleCreateFollow(req: Request): Promise<Response> {
  const accountId = await resolveAccountId(req);
  if (!accountId) {
    return error("認証が必要です", 401);
  }

  const body = await readJson(req);
  const targetPersonaKind = body?.targetPersonaKind;
  const targetPersonaId = body?.targetPersonaId;
  if (
    !isPersonaKind(targetPersonaKind) || typeof targetPersonaId !== "string"
  ) {
    return error("入力内容を確認してください", 422);
  }

  const table = personaTable(targetPersonaKind);
  const personaResult = await query<{ account_id: string }>(
    `select account_id from ${table} where id = $1`,
    [targetPersonaId],
  );
  const target = personaResult.rows[0];
  if (!target) {
    return error("ペルソナが見つかりません", 404);
  }
  if (target.account_id === accountId) {
    return error("自分自身はフォローできません", 422);
  }

  const result = await query<{ created_at: string }>(
    `insert into follows (follower_account_id, target_persona_type, target_persona_id)
     values ($1, $2, $3)
     on conflict (follower_account_id, target_persona_type, target_persona_id)
       do update set target_persona_type = excluded.target_persona_type
     returning created_at`,
    [accountId, targetPersonaKind, targetPersonaId],
  );
  return json({ createdAt: result.rows[0].created_at });
}

/** `DELETE /api/follows`。フォローしていない相手への要求も204にする（べき等）。 */
export async function handleDeleteFollow(req: Request): Promise<Response> {
  const accountId = await resolveAccountId(req);
  if (!accountId) {
    return error("認証が必要です", 401);
  }

  const body = await readJson(req);
  const targetPersonaKind = body?.targetPersonaKind;
  const targetPersonaId = body?.targetPersonaId;
  if (
    !isPersonaKind(targetPersonaKind) || typeof targetPersonaId !== "string"
  ) {
    return error("入力内容を確認してください", 422);
  }

  await query(
    `delete from follows
      where follower_account_id = $1
        and target_persona_type = $2
        and target_persona_id = $3`,
    [accountId, targetPersonaKind, targetPersonaId],
  );
  return new Response(null, { status: 204 });
}

/**
 * `GET /api/follows/me`。本人のみが参照できる（FR-FOLLOW-003）。
 * 「誰が自分をフォローしているか」を返す口はここには無い（FR-FOLLOW-004〜005、OUT-004）。
 */
export async function handleListFollows(req: Request): Promise<Response> {
  const accountId = await resolveAccountId(req);
  if (!accountId) {
    return error("認証が必要です", 401);
  }

  type FollowedPersonaRow = { id: string; nickname: string };

  const babyResult = await query<FollowedPersonaRow>(
    `select bp.id, bp.nickname
       from follows f
       join baby_personas bp on bp.id = f.target_persona_id
      where f.follower_account_id = $1 and f.target_persona_type = 'baby'
      order by f.created_at desc`,
    [accountId],
  );
  const motherResult = await query<FollowedPersonaRow>(
    `select mp.id, mp.nickname
       from follows f
       join mother_personas mp on mp.id = f.target_persona_id
      where f.follower_account_id = $1 and f.target_persona_type = 'mother'
      order by f.created_at desc`,
    [accountId],
  );

  return json({
    baby: babyResult.rows.map((row: FollowedPersonaRow) => ({
      id: row.id,
      kind: "baby",
      nickname: row.nickname,
    })),
    mother: motherResult.rows.map((row: FollowedPersonaRow) => ({
      id: row.id,
      kind: "mother",
      nickname: row.nickname,
    })),
  });
}
