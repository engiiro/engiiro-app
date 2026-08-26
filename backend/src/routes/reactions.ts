// docs/design_doc.md 7章「API設計」の
//   POST   /api/posts/:id/reactions
//   DELETE /api/posts/:id/reactions/:type
//   POST   /api/comments/:id/reactions
//   DELETE /api/comments/:id/reactions/:type
// に対応する実装。

import { resolveAccountId } from "../lib/auth.ts";
import { query } from "../lib/db.ts";
import { error, json, readJson } from "../lib/http.ts";
import {
  loadReactionStatesForComments,
  loadReactionStatesForPosts,
  reactionStateOf,
  type ReactionType,
} from "../lib/reactions.ts";

const REACTION_TYPES: readonly ReactionType[] = [
  "ogya",
  "yoshiyoshi",
  "manma",
  "babu",
];
const NORMAL_REACTIONS: readonly ReactionType[] = [
  "ogya",
  "yoshiyoshi",
  "manma",
];

function isReactionType(value: unknown): value is ReactionType {
  return REACTION_TYPES.includes(value as ReactionType);
}

/** PostgreSQLのトリガーが`RAISE EXCEPTION`で投げた例外かどうか（SQLSTATE P0001）。 */
function isRaisedException(err: unknown): boolean {
  return typeof err === "object" && err !== null &&
    (err as { code?: unknown }).code === "P0001";
}

/**
 * `POST /api/posts/:id/reactions`。バブルへは通常リアクション3種のみ許可する
 * （FR-REACT-003〜004）。自分のバブルへは自分でリアクションできない
 * （フロントエンド側の先行実装。design_doc.md 10章のオープンイシュー、要PO確認）。
 */
export async function handleCreatePostReaction(
  req: Request,
  postId: string,
): Promise<Response> {
  const accountId = await resolveAccountId(req);
  if (!accountId) {
    return error("認証が必要です", 401);
  }

  const body = await readJson(req);
  const type = body?.type;
  if (!isReactionType(type) || !NORMAL_REACTIONS.includes(type)) {
    return error("この種類のリアクションは選べません", 422);
  }

  const postResult = await query<{ author_account_id: string }>(
    `select bp.account_id as author_account_id
       from posts p
       join baby_personas bp on bp.id = p.baby_persona_id
      where p.id = $1 and p.deleted_at is null`,
    [postId],
  );
  const post = postResult.rows[0];
  if (!post) {
    return error("バブルが見つかりません", 404);
  }
  if (post.author_account_id === accountId) {
    return error("自分のバブルにはリアクションできません", 422);
  }

  try {
    await query(
      `insert into reactions (target_type, target_post_id, reactor_account_id, type)
       values ('post', $1, $2, $3)`,
      [postId, accountId, type],
    );
  } catch (err) {
    if (isRaisedException(err)) {
      return error("このリアクションはこれ以上押せません", 422);
    }
    throw err;
  }

  const reactionMap = await loadReactionStatesForPosts([postId], accountId);
  return json({ reactions: reactionStateOf(reactionMap, postId) });
}

/** `DELETE /api/posts/:id/reactions/:type`。自分が送信した分のうち1回を取り消す（FR-REACT-013）。 */
export async function handleDeletePostReaction(
  req: Request,
  postId: string,
  type: string,
): Promise<Response> {
  const accountId = await resolveAccountId(req);
  if (!accountId) {
    return error("認証が必要です", 401);
  }
  if (!isReactionType(type)) {
    return error("この種類のリアクションは選べません", 422);
  }

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

  const reactionMap = await loadReactionStatesForPosts([postId], accountId);
  return json({ reactions: reactionStateOf(reactionMap, postId) });
}

/**
 * `POST /api/comments/:id/reactions`。対象が赤ちゃんとしてのあやすなら通常リアクション3種、
 * お母さんとしてのあやすなら`babu`のみを許可する（FR-REACT-005〜007）。
 */
export async function handleCreateCommentReaction(
  req: Request,
  commentId: string,
): Promise<Response> {
  const accountId = await resolveAccountId(req);
  if (!accountId) {
    return error("認証が必要です", 401);
  }

  const body = await readJson(req);
  const type = body?.type;
  if (!isReactionType(type)) {
    return error("この種類のリアクションは選べません", 422);
  }

  const commentResult = await query<
    { persona_type: "baby" | "mother"; author_account_id: string }
  >(
    `select c.persona_type, coalesce(bp.account_id, mp.account_id) as author_account_id
       from comments c
       left join baby_personas bp on bp.id = c.baby_persona_id
       left join mother_personas mp on mp.id = c.mother_persona_id
      where c.id = $1 and c.deleted_at is null`,
    [commentId],
  );
  const comment = commentResult.rows[0];
  if (!comment) {
    return error("あやすが見つかりません", 404);
  }

  const allowed = comment.persona_type === "mother"
    ? type === "babu"
    : NORMAL_REACTIONS.includes(type);
  if (!allowed) {
    return error("この種類のリアクションは選べません", 422);
  }
  if (comment.author_account_id === accountId) {
    return error("自分のあやすにはリアクションできません", 422);
  }

  try {
    await query(
      `insert into reactions (target_type, target_comment_id, reactor_account_id, type)
       values ('comment', $1, $2, $3)`,
      [commentId, accountId, type],
    );
  } catch (err) {
    if (isRaisedException(err)) {
      return error("このリアクションはこれ以上押せません", 422);
    }
    throw err;
  }

  const reactionMap = await loadReactionStatesForComments(
    [commentId],
    accountId,
  );
  return json({ reactions: reactionStateOf(reactionMap, commentId) });
}

/** `DELETE /api/comments/:id/reactions/:type`。自分が送信した分のうち1回を取り消す（FR-REACT-013）。 */
export async function handleDeleteCommentReaction(
  req: Request,
  commentId: string,
  type: string,
): Promise<Response> {
  const accountId = await resolveAccountId(req);
  if (!accountId) {
    return error("認証が必要です", 401);
  }
  if (!isReactionType(type)) {
    return error("この種類のリアクションは選べません", 422);
  }

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

  const reactionMap = await loadReactionStatesForComments(
    [commentId],
    accountId,
  );
  return json({ reactions: reactionStateOf(reactionMap, commentId) });
}
