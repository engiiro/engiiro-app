import { query } from "./db.ts";

export type ReactionType = "ogya" | "yoshiyoshi" | "manma" | "babu";

/** design_doc.md 7.1章の`ReactionState`。値が0の種類はキーを省略する。 */
export type ReactionState = {
  readonly counts: Partial<Record<ReactionType, number>>;
  readonly mine: Partial<Record<ReactionType, number>>;
};

const EMPTY_STATE: ReactionState = { counts: {}, mine: {} };

/**
 * `target_type='post'`の複数バブルぶんのリアクションを1クエリで集計し、
 * `postId -> ReactionState`のMapで返す。N+1を避けるため、一覧取得側で
 * 対象の`postId`をまとめて渡す想定。
 *
 * `viewerAccountId`が`null`（未ログイン）のときは`mine`が全て0になる（FR-GUEST-005）。
 */
export async function loadReactionStatesForPosts(
  postIds: readonly string[],
  viewerAccountId: string | null,
): Promise<Map<string, ReactionState>> {
  return await loadReactionStates("target_post_id", postIds, viewerAccountId);
}

/** あやす版。`target_type='comment'`の複数あやすぶんを集計する。 */
export async function loadReactionStatesForComments(
  commentIds: readonly string[],
  viewerAccountId: string | null,
): Promise<Map<string, ReactionState>> {
  return await loadReactionStates(
    "target_comment_id",
    commentIds,
    viewerAccountId,
  );
}

async function loadReactionStates(
  column: "target_post_id" | "target_comment_id",
  ids: readonly string[],
  viewerAccountId: string | null,
): Promise<Map<string, ReactionState>> {
  const map = new Map<string, ReactionState>();
  if (ids.length === 0) return map;

  const result = await query<{
    target_id: string;
    type: ReactionType;
    total: string;
    mine: string;
  }>(
    `select ${column} as target_id, type, count(*) as total,
            count(*) filter (where reactor_account_id = $2) as mine
       from reactions
      where ${column} = any($1::uuid[])
      group by ${column}, type`,
    [ids, viewerAccountId],
  );

  for (const row of result.rows) {
    const state = map.get(row.target_id) ?? { counts: {}, mine: {} };
    const counts = { ...state.counts, [row.type]: Number(row.total) };
    const mine = viewerAccountId
      ? { ...state.mine, [row.type]: Number(row.mine) }
      : state.mine;
    map.set(row.target_id, { counts, mine });
  }

  return map;
}

/** 対象にリアクションが1件も無い場合の既定値。 */
export function reactionStateOf(
  map: Map<string, ReactionState>,
  id: string,
): ReactionState {
  return map.get(id) ?? EMPTY_STATE;
}
