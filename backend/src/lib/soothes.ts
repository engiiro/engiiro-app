import { query } from "./db.ts";
import { loadReactionStatesForComments, reactionStateOf } from "./reactions.ts";

type CommentRow = {
  id: string;
  post_id: string;
  body: string;
  created_at: string;
  reply_to_comment_id: string | null;
  persona_type: "baby" | "mother";
  author_id: string;
  author_nickname: string;
  author_account_id: string;
};

/** design_doc.md 7.1章の`Soothe`。 */
export type Soothe = {
  readonly id: string;
  readonly bubbleId: string;
  readonly author: {
    readonly id: string;
    readonly kind: "baby" | "mother";
    readonly nickname: string;
  };
  readonly body: string;
  readonly createdAt: string;
  readonly reactions: ReturnType<typeof reactionStateOf>;
  readonly isMine: boolean;
  readonly replyToSootheId?: string;
  readonly replyCount: number;
};

const COMMENT_SELECT = `
  select c.id, c.post_id, c.body, c.created_at, c.reply_to_comment_id, c.persona_type,
         coalesce(bp.id, mp.id) as author_id,
         coalesce(bp.nickname, mp.nickname) as author_nickname,
         coalesce(bp.account_id, mp.account_id) as author_account_id
    from comments c
    left join baby_personas bp on bp.id = c.baby_persona_id
    left join mother_personas mp on mp.id = c.mother_persona_id
`;

async function toSoothes(
  rows: readonly CommentRow[],
  viewerAccountId: string | null,
): Promise<Soothe[]> {
  if (rows.length === 0) return [];
  const commentIds = rows.map((row) => row.id);

  const [reactionMap, replyCounts] = await Promise.all([
    loadReactionStatesForComments(commentIds, viewerAccountId),
    loadReplyCounts(commentIds),
  ]);

  return rows.map((row) => ({
    id: row.id,
    bubbleId: row.post_id,
    author: {
      id: row.author_id,
      kind: row.persona_type,
      nickname: row.author_nickname,
    },
    body: row.body,
    createdAt: row.created_at,
    reactions: reactionStateOf(reactionMap, row.id),
    isMine: viewerAccountId !== null &&
      row.author_account_id === viewerAccountId,
    replyToSootheId: row.reply_to_comment_id ?? undefined,
    replyCount: replyCounts.get(row.id) ?? 0,
  }));
}

/** あやすに直接ついたあやすの件数（design_doc.md 7.1章の`replyCount`）。 */
async function loadReplyCounts(
  commentIds: readonly string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (commentIds.length === 0) return map;
  const result = await query<{ reply_to_comment_id: string; count: string }>(
    `select reply_to_comment_id, count(*) as count
       from comments
      where reply_to_comment_id = any($1::uuid[]) and deleted_at is null
      group by reply_to_comment_id`,
    [commentIds],
  );
  for (const row of result.rows) {
    map.set(row.reply_to_comment_id, Number(row.count));
  }
  return map;
}

/**
 * バブルに直接ついたあやすの一覧（あやすへの返信は含まない、design_doc.md 7.2章）。
 * 古い順に返す（会話として読む画面のため、フィードとは向きが逆）。
 */
export async function listDirectSoothes(
  postId: string,
  viewerAccountId: string | null,
): Promise<Soothe[]> {
  const result = await query<CommentRow>(
    `${COMMENT_SELECT}
      where c.post_id = $1 and c.reply_to_comment_id is null and c.deleted_at is null
      order by c.created_at asc`,
    [postId],
  );
  return await toSoothes(result.rows, viewerAccountId);
}

/** 1件取得。あやすへの返信を作るとき、返信先の`persona_type`を確認するために使う。 */
export async function findComment(id: string): Promise<
  {
    id: string;
    postId: string;
    personaType: "baby" | "mother";
    deletedAt: string | null;
  } | null
> {
  const result = await query<
    {
      id: string;
      post_id: string;
      persona_type: "baby" | "mother";
      deleted_at: string | null;
    }
  >(
    "select id, post_id, persona_type, deleted_at from comments where id = $1",
    [id],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    postId: row.post_id,
    personaType: row.persona_type,
    deletedAt: row.deleted_at,
  };
}

/** 1件をSoothe形式で取得する。POST後のレスポンス組み立てに使う。 */
export async function findSoothe(
  id: string,
  viewerAccountId: string | null,
): Promise<Soothe | null> {
  const result = await query<CommentRow>(`${COMMENT_SELECT} where c.id = $1`, [
    id,
  ]);
  const [soothe] = await toSoothes(result.rows, viewerAccountId);
  return soothe ?? null;
}
