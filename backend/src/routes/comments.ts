// docs/design_doc.md 7章「API設計」の
//   POST /api/posts/:id/comments
//   GET  /api/posts/:id/comments
//   GET  /api/comments/:id             （あやす詳細。実装フェーズの補完、人間の指示2026-08-26）
//   GET  /api/comments/:id/comments    （あやすへの返信一覧。同上）
// に対応する（「あやす」機能）。

import { query, withTransaction } from "../lib/db.ts";
import { resolveAccountId } from "../lib/auth.ts";
import { checkPostable } from "../lib/contentGate.ts";
import { recordPersonaAgeEstimate } from "../lib/personaEstimate.ts";
import { error, errorWithReason, json, readJson } from "../lib/http.ts";
import type {
  BabyPersonaRow,
  CommentRow,
  MotherPersonaRow,
  PersonaType,
} from "../models/types.ts";

interface CommentAuthorRow extends CommentRow {
  author_nickname: string;
}

interface ReactionCountRow {
  target_id: string;
  type: string;
  total: string;
  mine: string;
}

interface ReplyCountRow {
  reply_to_comment_id: string;
  count: string;
}

const COMMENT_REACTION_KEYS = {
  baby: ["ogya", "yoshiyoshi", "manma"] as const,
  mother: ["babu"] as const,
};

function emptyReactions(personaType: PersonaType) {
  const keys = COMMENT_REACTION_KEYS[personaType];
  const counts: Record<string, number> = {};
  const mine: Record<string, number> = {};
  for (const k of keys) {
    counts[k] = 0;
    mine[k] = 0;
  }
  return { counts, mine };
}

/** コメント本体に著者ニックネームを結合して取得する。1件でも複数件でも使う。 */
async function commentsWithAuthor(
  whereClause: string,
  params: unknown[],
): Promise<CommentAuthorRow[]> {
  const result = await query<CommentAuthorRow>(
    `select c.*,
            coalesce(bp.nickname, mp.nickname) as author_nickname
     from comments c
     left join baby_personas bp on bp.id = c.baby_persona_id
     left join mother_personas mp on mp.id = c.mother_persona_id
     where ${whereClause}`,
    params,
  );
  return result.rows;
}

async function reactionStatesForComments(
  commentIds: readonly string[],
  personaTypeById: ReadonlyMap<string, PersonaType>,
  viewerAccountId: string | null,
): Promise<Map<string, ReturnType<typeof emptyReactions>>> {
  const states = new Map<string, ReturnType<typeof emptyReactions>>();
  for (const id of commentIds) {
    states.set(id, emptyReactions(personaTypeById.get(id) ?? "baby"));
  }
  if (commentIds.length === 0) return states;

  const result = await query<ReactionCountRow>(
    `select target_comment_id as target_id, type,
            count(*) as total,
            count(*) filter (where reactor_account_id = $2) as mine
     from reactions
     where target_type = 'comment' and target_comment_id = any($1)
     group by target_comment_id, type`,
    [commentIds, viewerAccountId],
  );
  for (const row of result.rows) {
    const state = states.get(row.target_id);
    if (!state || !(row.type in state.counts)) continue;
    state.counts[row.type] = Number(row.total);
    state.mine[row.type] = Number(row.mine);
  }
  return states;
}

async function replyCountsFor(
  commentIds: readonly string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const id of commentIds) counts.set(id, 0);
  if (commentIds.length === 0) return counts;

  const result = await query<ReplyCountRow>(
    `select reply_to_comment_id, count(*) as count
     from comments
     where reply_to_comment_id = any($1) and deleted_at is null
     group by reply_to_comment_id`,
    [commentIds],
  );
  for (const row of result.rows) {
    counts.set(row.reply_to_comment_id, Number(row.count));
  }
  return counts;
}

function serializeComment(
  c: CommentAuthorRow,
  reactions: ReturnType<typeof emptyReactions>,
  replyCount: number,
  isMine: boolean,
) {
  return {
    id: c.id,
    author: {
      id: c.persona_type === "baby" ? c.baby_persona_id : c.mother_persona_id,
      kind: c.persona_type,
      nickname: c.author_nickname,
    },
    body: c.body,
    replyToCommentId: c.reply_to_comment_id ?? undefined,
    createdAt: c.created_at,
    reactions,
    replyCount,
    isMine,
  };
}

export async function handleCreateComment(
  req: Request,
  params: Record<string, string | undefined>,
): Promise<Response> {
  const accountId = await resolveAccountId(req);
  if (!accountId) return error("認証が必要です。", 401);

  const postId = params.id;
  if (!postId) return error("idを指定してください。", 400);

  const body = await readJson(req);
  if (!body) return error("リクエストの形式が正しくありません。", 400);

  const personaType = body.personaType;
  const text = typeof body.body === "string" ? body.body : "";
  const replyToCommentId = typeof body.replyToCommentId === "string"
    ? body.replyToCommentId
    : null;

  if (personaType !== "baby" && personaType !== "mother") {
    return error("personaTypeはbabyまたはmotherを指定してください。", 400);
  }

  const postResult = await query<{ id: string }>(
    "select id from posts where id = $1 and deleted_at is null",
    [postId],
  );
  if (!postResult.rows[0]) return error("対象のバブルが見つかりません。", 404);

  // お母さんとしてのあやすへ返信する場合、選択できるペルソナは赤ちゃんのみ（FR-COMMENT-005〜007）。
  // クライアントの選択肢の非表示だけに頼らず、サーバ側でも必ず検証する。
  if (replyToCommentId) {
    const parentResult = await query<{ persona_type: PersonaType }>(
      "select persona_type from comments where id = $1 and deleted_at is null",
      [replyToCommentId],
    );
    const parent = parentResult.rows[0];
    if (!parent) return error("返信先のあやすが見つかりません。", 404);
    if (parent.persona_type === "mother" && personaType !== "baby") {
      return error(
        "お母さんとしてのあやすへ返信できるのは赤ちゃんペルソナのみです。",
        403,
      );
    }
  }

  const gate = await checkPostable(text, personaType);
  if (!gate.ok) {
    const status = gate.reason === "ai_unavailable" ? 503 : 422;
    return errorWithReason(
      gate.publicMessage ?? "保存できませんでした。",
      status,
      gate.reason ?? "moderation",
    );
  }

  let babyPersonaId: string | null = null;
  let motherPersonaId: string | null = null;
  let selfPersonaId: string;

  if (personaType === "baby") {
    const result = await query<BabyPersonaRow>(
      "select id from baby_personas where account_id = $1",
      [accountId],
    );
    if (!result.rows[0]) {
      return error("赤ちゃんペルソナが見つかりません。", 404);
    }
    selfPersonaId = result.rows[0].id;
    babyPersonaId = selfPersonaId;
  } else {
    const result = await query<MotherPersonaRow>(
      "select id from mother_personas where account_id = $1",
      [accountId],
    );
    if (!result.rows[0]) {
      return error("お母さんペルソナが見つかりません。", 404);
    }
    selfPersonaId = result.rows[0].id;
    motherPersonaId = selfPersonaId;
  }

  try {
    const created = await withTransaction(async (client) => {
      return await client.query<CommentRow>(
        `insert into comments (post_id, persona_type, baby_persona_id, mother_persona_id, reply_to_comment_id, body)
         values ($1, $2, $3, $4, $5, $6)
         returning id, created_at`,
        [
          postId,
          personaType,
          babyPersonaId,
          motherPersonaId,
          replyToCommentId,
          text,
        ],
      );
    });
    const comment = created.rows[0];

    if (gate.estimatedAge !== undefined) {
      await recordPersonaAgeEstimate(
        personaType,
        selfPersonaId,
        gate.estimatedAge,
      );
    }

    return json({ id: comment.id, createdAt: comment.created_at }, 201);
  } catch (err) {
    console.error("[comments] create failed:", err);
    return error("あやすの保存に失敗しました。", 500);
  }
}

export async function handleListComments(
  req: Request,
  params: Record<string, string | undefined>,
): Promise<Response> {
  const postId = params.id;
  if (!postId) return error("idを指定してください。", 400);

  const accountId = await resolveAccountId(req);

  // ★ バブルに直接ついたあやすだけを返す（人間の指示、2026-08-26）。
  //   あやすへの返信は GET /api/comments/:id/comments 側で返す。
  const rows = await commentsWithAuthor(
    "c.post_id = $1 and c.reply_to_comment_id is null and c.deleted_at is null order by c.created_at asc",
    [postId],
  );

  const ids = rows.map((c) => c.id);
  const personaTypeById = new Map(rows.map((c) => [c.id, c.persona_type]));
  const [reactionStates, replyCounts, viewer] = await Promise.all([
    reactionStatesForComments(ids, personaTypeById, accountId),
    replyCountsFor(ids),
    viewerPersonaIds(accountId),
  ]);

  return json({
    comments: rows.map((c) =>
      serializeComment(
        c,
        reactionStates.get(c.id)!,
        replyCounts.get(c.id) ?? 0,
        isMine(c, viewer),
      )
    ),
  });
}

/**
 * あやす詳細（GET /api/comments/:id 相当。人間の指示、2026-08-26）。
 * 設計書§7には無い口だが、S4bのために実装フェーズで補完する。
 */
export async function handleGetComment(
  req: Request,
  params: Record<string, string | undefined>,
): Promise<Response> {
  const id = params.id;
  if (!id) return error("idを指定してください。", 400);

  const accountId = await resolveAccountId(req);

  const rows = await commentsWithAuthor("c.id = $1 and c.deleted_at is null", [
    id,
  ]);
  const comment = rows[0];
  if (!comment) return error("見つかりませんでした。", 404);

  const [reactionStates, replyCounts, postResult, replyToResult, viewer] =
    await Promise.all([
      reactionStatesForComments(
        [id],
        new Map([[id, comment.persona_type]]),
        accountId,
      ),
      replyCountsFor([id]),
      query<{ id: string; body: string; baby_persona_id: string }>(
        "select id, body, baby_persona_id from posts where id = $1 and deleted_at is null",
        [comment.post_id],
      ),
      comment.reply_to_comment_id
        ? commentsWithAuthor("c.id = $1 and c.deleted_at is null", [
          comment.reply_to_comment_id,
        ])
        : Promise.resolve([]),
      viewerPersonaIds(accountId),
    ]);

  const post = postResult.rows[0];
  const bubbleExcerpt = post ? excerptOf(post.body) : "けされた バブル";
  let bubbleIsMine = false;
  if (post && accountId) {
    const ownerResult = await query<{ account_id: string }>(
      "select account_id from baby_personas where id = $1",
      [post.baby_persona_id],
    );
    bubbleIsMine = ownerResult.rows[0]?.account_id === accountId;
  }

  return json({
    soothe: serializeComment(
      comment,
      reactionStates.get(id)!,
      replyCounts.get(id) ?? 0,
      isMine(comment, viewer),
    ),
    bubbleId: comment.post_id,
    bubbleExcerpt,
    bubbleIsMine,
    replyToNickname: replyToResult[0]?.author_nickname,
  });
}

/**
 * あやすへの返信一覧（GET /api/comments/:id/comments 相当。人間の指示、2026-08-26）。
 * 親をさかのぼった連鎖は返さない。1階層ずつ開く。
 */
export async function handleListCommentReplies(
  req: Request,
  params: Record<string, string | undefined>,
): Promise<Response> {
  const id = params.id;
  if (!id) return error("idを指定してください。", 400);

  const accountId = await resolveAccountId(req);

  const parentResult = await query<{ id: string }>(
    "select id from comments where id = $1 and deleted_at is null",
    [id],
  );
  if (!parentResult.rows[0]) return error("見つかりませんでした。", 404);

  const rows = await commentsWithAuthor(
    "c.reply_to_comment_id = $1 and c.deleted_at is null order by c.created_at asc",
    [id],
  );
  const ids = rows.map((c) => c.id);
  const personaTypeById = new Map(rows.map((c) => [c.id, c.persona_type]));
  const [reactionStates, replyCounts, viewer] = await Promise.all([
    reactionStatesForComments(ids, personaTypeById, accountId),
    replyCountsFor(ids),
    viewerPersonaIds(accountId),
  ]);

  return json({
    comments: rows.map((c) =>
      serializeComment(
        c,
        reactionStates.get(c.id)!,
        replyCounts.get(c.id) ?? 0,
        isMine(c, viewer),
      )
    ),
  });
}

function excerptOf(body: string): string {
  const EXCERPT_MAX = 24;
  const chars = [...body];
  return chars.length <= EXCERPT_MAX
    ? body
    : chars.slice(0, EXCERPT_MAX).join("") + "…";
}

interface ViewerPersonaIds {
  babyPersonaId: string | null;
  motherPersonaId: string | null;
}

/** 閲覧者自身の赤ちゃん・お母さん両ペルソナidを引く。isMine判定に使う。 */
async function viewerPersonaIds(
  accountId: string | null,
): Promise<ViewerPersonaIds> {
  if (!accountId) return { babyPersonaId: null, motherPersonaId: null };
  const [babyResult, motherResult] = await Promise.all([
    query<{ id: string }>(
      "select id from baby_personas where account_id = $1",
      [
        accountId,
      ],
    ),
    query<{ id: string }>(
      "select id from mother_personas where account_id = $1",
      [
        accountId,
      ],
    ),
  ]);
  return {
    babyPersonaId: babyResult.rows[0]?.id ?? null,
    motherPersonaId: motherResult.rows[0]?.id ?? null,
  };
}

/** このコメントの著者が閲覧者自身か。ペルソナidの一致で判定する（accountIdは経由しない）。 */
function isMine(c: CommentAuthorRow, viewer: ViewerPersonaIds): boolean {
  if (c.persona_type === "baby") {
    return c.baby_persona_id === viewer.babyPersonaId;
  }
  return c.mother_persona_id === viewer.motherPersonaId;
}
