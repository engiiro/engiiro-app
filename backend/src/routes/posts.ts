// docs/design_doc.md 7章「API設計」の
//   POST   /api/posts
//   GET    /api/posts/feed
//   GET    /api/posts/:id
//   DELETE /api/posts/:id
// に対応する。

import { query, withTransaction } from "../lib/db.ts";
import { resolveAccountId } from "../lib/auth.ts";
import { checkPostable } from "../lib/contentGate.ts";
import { recordPersonaAgeEstimate } from "../lib/personaEstimate.ts";
import { error, errorWithReason, json, readJson } from "../lib/http.ts";
import type { BabyPersonaRow, PostRow, PostStampRow } from "../models/types.ts";

interface StampInput {
  stampId: string;
  position?: number;
}

interface IdRow {
  id: string;
}

interface EstimatedAgeRow {
  estimated_age: string | null;
}

interface PostFeedRow extends PostRow {
  estimated_age: string | null;
  author_nickname: string;
}

interface ReactionCountRow {
  target_id: string;
  type: string;
  total: string;
  mine: string;
}

interface SootheCountRow {
  post_id: string;
  count: string;
}

interface AccountIdRow {
  account_id: string;
}

interface DeletedAtRow {
  deleted_at: string;
}

function emptyReactions() {
  return {
    counts: { ogya: 0, yoshiyoshi: 0, manma: 0 },
    mine: { ogya: 0, yoshiyoshi: 0, manma: 0 },
  };
}

/**
 * 複数の投稿idに対して、リアクション件数(全員ぶん・閲覧者ぶん)を一括で取得する。
 * feedのようにN件同時に組み立てるときのN+1を避けるため、対象idをまとめて渡す。
 */
async function reactionStatesForPosts(
  postIds: readonly string[],
  viewerAccountId: string | null,
): Promise<Map<string, ReturnType<typeof emptyReactions>>> {
  const states = new Map<string, ReturnType<typeof emptyReactions>>();
  for (const id of postIds) states.set(id, emptyReactions());
  if (postIds.length === 0) return states;

  const result = await query<ReactionCountRow>(
    `select target_post_id as target_id, type,
            count(*) as total,
            count(*) filter (where reactor_account_id = $2) as mine
     from reactions
     where target_type = 'post' and target_post_id = any($1)
     group by target_post_id, type`,
    [postIds, viewerAccountId],
  );
  for (const row of result.rows) {
    const state = states.get(row.target_id);
    if (!state || !(row.type in state.counts)) continue;
    (state.counts as Record<string, number>)[row.type] = Number(row.total);
    (state.mine as Record<string, number>)[row.type] = Number(row.mine);
  }
  return states;
}

async function sootheCountsForPosts(
  postIds: readonly string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const id of postIds) counts.set(id, 0);
  if (postIds.length === 0) return counts;

  const result = await query<SootheCountRow>(
    `select post_id, count(*) as count
     from comments
     where post_id = any($1) and reply_to_comment_id is null and deleted_at is null
     group by post_id`,
    [postIds],
  );
  for (const row of result.rows) counts.set(row.post_id, Number(row.count));
  return counts;
}

export async function handleCreatePost(req: Request): Promise<Response> {
  const accountId = await resolveAccountId(req);
  if (!accountId) return error("認証が必要です。", 401);

  const body = await readJson(req);
  if (!body) return error("リクエストの形式が正しくありません。", 400);

  const text = typeof body.body === "string" ? body.body : "";
  const stamps: StampInput[] = Array.isArray(body.stamps) ? body.stamps : [];

  const personaResult = await query<BabyPersonaRow>(
    "select id from baby_personas where account_id = $1",
    [accountId],
  );
  const babyPersona = personaResult.rows[0];
  if (!babyPersona) return error("赤ちゃんペルソナが見つかりません。", 404);

  const gate = await checkPostable(text, "baby");
  if (!gate.ok) {
    const status = gate.reason === "ai_unavailable" ? 503 : 422;
    return errorWithReason(
      gate.publicMessage ?? "保存できませんでした。",
      status,
      gate.reason ?? "moderation",
    );
  }

  try {
    const created = await withTransaction(async (client) => {
      const postResult = await client.query<PostRow>(
        `insert into posts (baby_persona_id, body)
         values ($1, $2)
         returning id, created_at`,
        [babyPersona.id, text],
      );
      const post = postResult.rows[0];

      for (const stamp of stamps) {
        if (typeof stamp.stampId !== "string") continue;
        await client.query(
          `insert into post_stamps (post_id, stamp_id, position)
           values ($1, $2, $3)`,
          [post.id, stamp.stampId, stamp.position ?? null],
        );
      }

      return post;
    });

    if (gate.estimatedAge !== undefined) {
      await recordPersonaAgeEstimate("baby", babyPersona.id, gate.estimatedAge);
    }

    return json({ id: created.id, createdAt: created.created_at }, 201);
  } catch (err) {
    console.error("[posts] create failed:", err);
    return error("投稿の保存に失敗しました。", 500);
  }
}

export async function handleFeed(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0
    ? Math.min(limitParam, 50)
    : 20;
  const cursor = url.searchParams.get("cursor");

  const accountId = await resolveAccountId(req);

  // 閲覧者のペルソナの推定年齢に近い投稿を優先する（FR-FEED-003）。
  // 未ログイン時は新着順のみ（FR-GUEST-004、4.4章）。
  // 具体的なランキングロジックは実装フェーズで検討する項目のため、ここでは
  // 「推定年齢の近さ」で単純に並べ替える最小実装にする。
  let viewerEstimatedAge: number | null = null;
  let viewerBabyPersonaId: string | null = null;
  if (accountId) {
    const babyResult = await query<IdRow>(
      "select id from baby_personas where account_id = $1",
      [accountId],
    );
    viewerBabyPersonaId = babyResult.rows[0]?.id ?? null;
    if (viewerBabyPersonaId) {
      const estimateResult = await query<EstimatedAgeRow>(
        "select estimated_age from persona_age_estimates where persona_type = 'baby' and persona_id = $1",
        [viewerBabyPersonaId],
      );
      const value = estimateResult.rows[0]?.estimated_age;
      viewerEstimatedAge = value !== null && value !== undefined
        ? Number(value)
        : null;
    }
  }

  const params: unknown[] = [];
  let cursorClause = "";
  if (cursor) {
    params.push(cursor);
    cursorClause =
      `and p.created_at < (select created_at from posts where id = $${params.length})`;
  }
  params.push(limit);

  const result = await query<PostFeedRow>(
    `select p.*, pae.estimated_age, bp.nickname as author_nickname
     from posts p
     join baby_personas bp on bp.id = p.baby_persona_id
     left join persona_age_estimates pae
       on pae.persona_type = 'baby' and pae.persona_id = p.baby_persona_id
     where p.deleted_at is null
     ${cursorClause}
     order by p.created_at desc
     limit $${params.length}`,
    params,
  );

  interface RankedRow {
    row: PostFeedRow;
    similarityScore: number | undefined;
  }

  const rows: RankedRow[] = result.rows.map((row: PostFeedRow) => {
    const estimatedAge = row.estimated_age !== null
      ? Number(row.estimated_age)
      : null;
    const similarityScore = viewerEstimatedAge !== null && estimatedAge !== null
      ? 1 / (1 + Math.abs(viewerEstimatedAge - estimatedAge))
      : undefined;
    return { row, similarityScore };
  });

  if (viewerEstimatedAge !== null) {
    rows.sort((a: RankedRow, b: RankedRow) =>
      (b.similarityScore ?? 0) - (a.similarityScore ?? 0)
    );
  }

  const postIds = rows.map(({ row }) => row.id);
  const [stampsResult, reactionStates, sootheCounts] = await Promise.all([
    query<PostStampRow & { post_id: string }>(
      `select post_id, stamp_id, position from post_stamps where post_id = any($1)`,
      [postIds],
    ),
    reactionStatesForPosts(postIds, accountId),
    sootheCountsForPosts(postIds),
  ]);
  const stampsByPost = new Map<
    string,
    { stampId: string; position: number | null }[]
  >();
  for (const s of stampsResult.rows) {
    const list = stampsByPost.get(s.post_id) ?? [];
    list.push({ stampId: s.stamp_id, position: s.position });
    stampsByPost.set(s.post_id, list);
  }

  const posts = rows.map(({ row, similarityScore }: RankedRow) => ({
    id: row.id,
    author: { id: row.baby_persona_id, nickname: row.author_nickname },
    body: row.body,
    stamps: stampsByPost.get(row.id) ?? [],
    reactions: reactionStates.get(row.id) ?? emptyReactions(),
    sootheCount: sootheCounts.get(row.id) ?? 0,
    isMine: viewerBabyPersonaId !== null &&
      row.baby_persona_id === viewerBabyPersonaId,
    createdAt: row.created_at,
    ...(similarityScore !== undefined ? { similarityScore } : {}),
  }));

  const nextCursor = result.rows.length === limit
    ? result.rows[result.rows.length - 1].id
    : undefined;

  return json({ posts, ...(nextCursor ? { nextCursor } : {}) });
}

export async function handleGetPost(
  req: Request,
  params: Record<string, string | undefined>,
): Promise<Response> {
  const id = params.id;
  if (!id) return error("idを指定してください。", 400);

  const accountId = await resolveAccountId(req);

  const postResult = await query<PostRow & { author_nickname: string }>(
    `select p.*, bp.nickname as author_nickname
     from posts p
     join baby_personas bp on bp.id = p.baby_persona_id
     where p.id = $1 and p.deleted_at is null`,
    [id],
  );
  const post = postResult.rows[0];
  if (!post) return error("見つかりませんでした。", 404);

  const [stampsResult, reactionStates, sootheCounts] = await Promise.all([
    query<PostStampRow>(
      "select stamp_id, position from post_stamps where post_id = $1",
      [id],
    ),
    reactionStatesForPosts([id], accountId),
    sootheCountsForPosts([id]),
  ]);

  return json({
    id: post.id,
    author: { id: post.baby_persona_id, nickname: post.author_nickname },
    body: post.body,
    stamps: stampsResult.rows.map((s: PostStampRow) => ({
      stampId: s.stamp_id,
      position: s.position,
    })),
    reactions: reactionStates.get(id) ?? emptyReactions(),
    sootheCount: sootheCounts.get(id) ?? 0,
    isMine: accountId !== null && await isPostOwnedBy(id, accountId),
    createdAt: post.created_at,
  });
}

async function isPostOwnedBy(
  postId: string,
  accountId: string,
): Promise<boolean> {
  const result = await query<AccountIdRow>(
    `select bp.account_id
     from posts p
     join baby_personas bp on bp.id = p.baby_persona_id
     where p.id = $1`,
    [postId],
  );
  return result.rows[0]?.account_id === accountId;
}

export async function handleDeletePost(
  req: Request,
  params: Record<string, string | undefined>,
): Promise<Response> {
  const accountId = await resolveAccountId(req);
  if (!accountId) return error("認証が必要です。", 401);

  const id = params.id;
  if (!id) return error("idを指定してください。", 400);

  const ownerResult = await query<AccountIdRow>(
    `select bp.account_id
     from posts p
     join baby_personas bp on bp.id = p.baby_persona_id
     where p.id = $1 and p.deleted_at is null`,
    [id],
  );
  const owner = ownerResult.rows[0];
  if (!owner) return error("見つかりませんでした。", 404);
  if (owner.account_id !== accountId) {
    return error("自分のバブルのみ削除できます。", 403);
  }

  const result = await query<DeletedAtRow>(
    "update posts set deleted_at = now() where id = $1 returning deleted_at",
    [id],
  );

  return json({ deletedAt: result.rows[0].deleted_at });
}
