// docs/design_doc.md 7章「API設計」・9.1章「リアクションの対象別マトリクス」に対応する。
//   POST   /api/posts/:id/reactions
//   DELETE /api/posts/:id/reactions/:type
//   POST   /api/comments/:id/reactions
//   DELETE /api/comments/:id/reactions/:type
//
// 対象によって許可されるtypeが異なる（バブル・赤ちゃんのあやす→ogya/yoshiyoshi/manma、
// お母さんのあやす→babuのみ）。同一利用者・同一対象・同一typeは5回まで
// （DB側のreactions_enforce_limitトリガーで検査、FR-REACT-010〜011）。

import { query } from "../lib/db.ts";
import { resolveAccountId } from "../lib/auth.ts";
import { error, json, readJson } from "../lib/http.ts";
import type { ReactionType } from "../models/types.ts";

const POST_REACTION_TYPES: ReactionType[] = ["ogya", "yoshiyoshi", "manma"];

const ALL_REACTION_TYPES: ReactionType[] = [
  "ogya",
  "yoshiyoshi",
  "manma",
  "babu",
];

function isReactionType(value: unknown): value is ReactionType {
  return typeof value === "string" &&
    (ALL_REACTION_TYPES as string[]).includes(value);
}

interface ReactionCountAggRow {
  type: string;
  total: string;
  mine: string;
}

interface PostOwnerRow {
  id: string;
  account_id: string;
}

interface CreatedRow {
  id: string;
  created_at: string;
}

interface PersonaTypeRow {
  persona_type: string;
}

interface TotalMineRow {
  total: string;
  mine: string;
}

async function postReactionCounts(postId: string, accountId: string) {
  const result = await query<ReactionCountAggRow>(
    `select type,
            count(*) as total,
            count(*) filter (where reactor_account_id = $2) as mine
     from reactions
     where target_type = 'post' and target_post_id = $1
     group by type`,
    [postId, accountId],
  );
  const counts: Record<string, { total: number; mine: number }> = {
    ogya: { total: 0, mine: 0 },
    yoshiyoshi: { total: 0, mine: 0 },
    manma: { total: 0, mine: 0 },
  };
  for (const r of result.rows) {
    if (r.type in counts) {
      counts[r.type] = { total: Number(r.total), mine: Number(r.mine) };
    }
  }
  return counts;
}

export async function handleCreatePostReaction(
  req: Request,
  params: Record<string, string | undefined>,
): Promise<Response> {
  const accountId = await resolveAccountId(req);
  if (!accountId) return error("認証が必要です。", 401);

  const postId = params.id;
  if (!postId) return error("idを指定してください。", 400);

  const body = await readJson(req);
  if (!body) return error("リクエストの形式が正しくありません。", 400);

  const type = body.type;
  if (!isReactionType(type) || !POST_REACTION_TYPES.includes(type)) {
    return error("バブルにはおぎゃー・よしよし・まんまのみ送れます。", 400);
  }

  const postResult = await query<PostOwnerRow>(
    `select p.id, bp.account_id
     from posts p
     join baby_personas bp on bp.id = p.baby_persona_id
     where p.id = $1 and p.deleted_at is null`,
    [postId],
  );
  const post = postResult.rows[0];
  if (!post) return error("見つかりませんでした。", 404);
  if (post.account_id === accountId) {
    return error("自分のバブルにはリアクションできません。", 403);
  }

  try {
    const result = await query<CreatedRow>(
      `insert into reactions (target_type, target_post_id, reactor_account_id, type)
       values ('post', $1, $2, $3)
       returning id, created_at`,
      [postId, accountId, type],
    );
    const counts = await postReactionCounts(postId, accountId);
    return json(
      { id: result.rows[0].id, createdAt: result.rows[0].created_at, counts },
      201,
    );
  } catch (err) {
    if (
      err instanceof Error && err.message.includes("reaction limit exceeded")
    ) {
      return error("同じ種類のリアクションは1人5回までです。", 409);
    }
    console.error("[reactions] create failed:", err);
    return error("リアクションの保存に失敗しました。", 500);
  }
}

export async function handleDeletePostReaction(
  req: Request,
  params: Record<string, string | undefined>,
): Promise<Response> {
  const accountId = await resolveAccountId(req);
  if (!accountId) return error("認証が必要です。", 401);

  const postId = params.id;
  const type = params.type;
  if (!postId || !type) return error("idとtypeを指定してください。", 400);

  await query(
    `delete from reactions
     where id = (
       select id from reactions
       where target_type = 'post' and target_post_id = $1
         and reactor_account_id = $2 and type = $3
       limit 1
     )`,
    [postId, accountId, type],
  );

  const counts = await postReactionCounts(postId, accountId);
  return json({ counts });
}

async function resolveCommentAllowedTypes(
  commentId: string,
): Promise<ReactionType[] | null> {
  const result = await query<PersonaTypeRow>(
    "select persona_type from comments where id = $1 and deleted_at is null",
    [commentId],
  );
  const comment = result.rows[0];
  if (!comment) return null;
  return comment.persona_type === "mother" ? ["babu"] : POST_REACTION_TYPES;
}

async function commentReactionCount(
  commentId: string,
  type: string,
  accountId: string,
) {
  const result = await query<TotalMineRow>(
    `select count(*) as total,
            count(*) filter (where reactor_account_id = $3) as mine
     from reactions
     where target_type = 'comment' and target_comment_id = $1 and type = $2`,
    [commentId, type, accountId],
  );
  return {
    [type]: Number(result.rows[0]?.total ?? 0),
    mine: Number(result.rows[0]?.mine ?? 0),
  };
}

export async function handleCreateCommentReaction(
  req: Request,
  params: Record<string, string | undefined>,
): Promise<Response> {
  const accountId = await resolveAccountId(req);
  if (!accountId) return error("認証が必要です。", 401);

  const commentId = params.id;
  if (!commentId) return error("idを指定してください。", 400);

  const body = await readJson(req);
  if (!body) return error("リクエストの形式が正しくありません。", 400);

  const type = body.type;
  const allowedTypes = await resolveCommentAllowedTypes(commentId);
  if (allowedTypes === null) return error("見つかりませんでした。", 404);
  if (!isReactionType(type) || !allowedTypes.includes(type)) {
    return error("この対象には送れないリアクション種別です。", 400);
  }

  try {
    const result = await query<CreatedRow>(
      `insert into reactions (target_type, target_comment_id, reactor_account_id, type)
       values ('comment', $1, $2, $3)
       returning id, created_at`,
      [commentId, accountId, type],
    );
    const counts = await commentReactionCount(commentId, type, accountId);
    return json(
      { id: result.rows[0].id, createdAt: result.rows[0].created_at, counts },
      201,
    );
  } catch (err) {
    if (
      err instanceof Error && err.message.includes("reaction limit exceeded")
    ) {
      return error("同じ種類のリアクションは1人5回までです。", 409);
    }
    console.error("[reactions] create failed:", err);
    return error("リアクションの保存に失敗しました。", 500);
  }
}

export async function handleDeleteCommentReaction(
  req: Request,
  params: Record<string, string | undefined>,
): Promise<Response> {
  const accountId = await resolveAccountId(req);
  if (!accountId) return error("認証が必要です。", 401);

  const commentId = params.id;
  const type = params.type;
  if (!commentId || !type) return error("idとtypeを指定してください。", 400);

  await query(
    `delete from reactions
     where id = (
       select id from reactions
       where target_type = 'comment' and target_comment_id = $1
         and reactor_account_id = $2 and type = $3
       limit 1
     )`,
    [commentId, accountId, type],
  );

  const counts = await commentReactionCount(commentId, type, accountId);
  return json({ counts });
}
