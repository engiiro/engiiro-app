import { query } from "./db.ts";
import { loadReactionStatesForPosts, reactionStateOf } from "./reactions.ts";

type PostRow = {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
  author_nickname: string;
  author_account_id: string;
};

type StampRow = { stamp_id: string; position: number | null };

/** design_doc.md 7.1章の`Bubble`。 */
export type Bubble = {
  readonly id: string;
  readonly author: {
    readonly id: string;
    readonly kind: "baby";
    readonly nickname: string;
  };
  readonly body: string;
  readonly stamps: readonly {
    readonly stampId: string;
    readonly position: number | null;
  }[];
  readonly createdAt: string;
  readonly reactions: ReturnType<typeof reactionStateOf>;
  readonly isMine: boolean;
  readonly affinity: number;
  readonly sootheCount: number;
};

const POST_SELECT = `
  select p.id, p.body, p.created_at,
         bp.id as author_id, bp.nickname as author_nickname, bp.account_id as author_account_id
    from posts p
    join baby_personas bp on bp.id = p.baby_persona_id
`;

/**
 * 新しさだけに基づく暫定のaffinityスコア（0〜1、新しいほど1に近い）。
 *
 * FR-FEED-003が求める「閲覧者の推定年齢・近い悩みに基づく優先表示」を計算するには
 * persona_age_estimatesの集計が要るが、まだAI評価結果をそこへ書き込む処理を
 * 実装していない。それまでの暫定値として、新着順に単調な値を返す
 * （design_doc.md 8章「まずはシンプルなルールベースでも良い」）。
 */
function provisionalAffinity(createdAt: string): number {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  return 1 / (1 + ageHours / 24);
}

async function toBubbles(
  rows: readonly PostRow[],
  viewerAccountId: string | null,
): Promise<Bubble[]> {
  if (rows.length === 0) return [];
  const postIds = rows.map((row) => row.id);

  const [stampsResult, reactionMap, sootheCounts] = await Promise.all([
    query<StampRow & { post_id: string }>(
      "select post_id, stamp_id, position from post_stamps where post_id = any($1::uuid[])",
      [postIds],
    ),
    loadReactionStatesForPosts(postIds, viewerAccountId),
    loadSootheCounts(postIds),
  ]);

  const stampsByPost = new Map<string, StampRow[]>();
  for (const row of stampsResult.rows) {
    const list = stampsByPost.get(row.post_id) ?? [];
    list.push({ stamp_id: row.stamp_id, position: row.position });
    stampsByPost.set(row.post_id, list);
  }

  return rows.map((row) => ({
    id: row.id,
    author: {
      id: row.author_id,
      kind: "baby" as const,
      nickname: row.author_nickname,
    },
    body: row.body,
    stamps: (stampsByPost.get(row.id) ?? []).map((s) => ({
      stampId: s.stamp_id,
      position: s.position,
    })),
    createdAt: row.created_at,
    reactions: reactionStateOf(reactionMap, row.id),
    isMine: viewerAccountId !== null &&
      row.author_account_id === viewerAccountId,
    affinity: provisionalAffinity(row.created_at),
    sootheCount: sootheCounts.get(row.id) ?? 0,
  }));
}

/** バブルに直接ついたあやすの件数（あやすへの返信は含まない、design_doc.md 7.1章）。 */
async function loadSootheCounts(
  postIds: readonly string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (postIds.length === 0) return map;
  const result = await query<{ post_id: string; count: string }>(
    `select post_id, count(*) as count
       from comments
      where post_id = any($1::uuid[]) and reply_to_comment_id is null and deleted_at is null
      group by post_id`,
    [postIds],
  );
  for (const row of result.rows) {
    map.set(row.post_id, Number(row.count));
  }
  return map;
}

/** 削除済みでないバブルを新着順で取得する。フィード用。 */
export async function listBubbles(
  viewerAccountId: string | null,
): Promise<Bubble[]> {
  const result = await query<PostRow>(
    `${POST_SELECT} where p.deleted_at is null order by p.created_at desc`,
  );
  return await toBubbles(result.rows, viewerAccountId);
}

/** 1件取得。削除済みならnull（FR-POST-006）。 */
export async function findBubble(
  id: string,
  viewerAccountId: string | null,
): Promise<Bubble | null> {
  const result = await query<PostRow>(
    `${POST_SELECT} where p.id = $1 and p.deleted_at is null`,
    [id],
  );
  const [bubble] = await toBubbles(result.rows, viewerAccountId);
  return bubble ?? null;
}
