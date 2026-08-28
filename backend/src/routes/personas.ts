// docs/design_doc.md 7章 GET /api/personas/baby/:id, GET /api/personas/mother/:id に対応する。
// 他人から見える公開プロフィール。そのペルソナ単独の公開情報とバブル/あやす一覧のみを返し、
// accountIdやもう一方のペルソナの情報は一切含めない（3.2章、3.4章、FR-PERSONA-003〜004）。

import { query } from "../lib/db.ts";
import { error, json } from "../lib/http.ts";
import type { BabyPersonaRow, MotherPersonaRow } from "../models/types.ts";

interface IdRow {
  id: string;
}

export async function handleGetBabyPersona(
  _req: Request,
  params: Record<string, string | undefined>,
): Promise<Response> {
  const id = params.id;
  if (!id) return error("idを指定してください。", 400);

  const personaResult = await query<BabyPersonaRow>(
    "select id, nickname, bio from baby_personas where id = $1",
    [id],
  );
  const persona = personaResult.rows[0];
  if (!persona) return error("見つかりませんでした。", 404);

  // babyAllタブ（人間の指示、2026-08-25）は「赤ちゃんとしてのバブルとあやすの両方」を
  // 含むため、投稿だけでなく赤ちゃんペルソナとして書いたあやすのidも合わせて返す。
  const [postsResult, commentsResult] = await Promise.all([
    query<IdRow>(
      `select id from posts
       where baby_persona_id = $1 and deleted_at is null
       order by created_at desc`,
      [id],
    ),
    query<IdRow>(
      `select id from comments
       where baby_persona_id = $1 and deleted_at is null
       order by created_at desc`,
      [id],
    ),
  ]);

  return json({
    id: persona.id,
    nickname: persona.nickname,
    bio: persona.bio,
    postIds: postsResult.rows.map((r: IdRow) => r.id),
    commentIds: commentsResult.rows.map((r: IdRow) => r.id),
  });
}

export async function handleGetMotherPersona(
  _req: Request,
  params: Record<string, string | undefined>,
): Promise<Response> {
  const id = params.id;
  if (!id) return error("idを指定してください。", 400);

  const personaResult = await query<MotherPersonaRow>(
    "select id, nickname, bio from mother_personas where id = $1",
    [id],
  );
  const persona = personaResult.rows[0];
  if (!persona) return error("見つかりませんでした。", 404);

  const commentsResult = await query<IdRow>(
    `select id from comments
     where mother_persona_id = $1 and deleted_at is null
     order by created_at desc`,
    [id],
  );

  return json({
    id: persona.id,
    nickname: persona.nickname,
    bio: persona.bio,
    commentIds: commentsResult.rows.map((r: IdRow) => r.id),
  });
}
