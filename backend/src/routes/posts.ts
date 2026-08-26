// docs/design_doc.md 7章「API設計」の
//   POST   /api/posts
//   GET    /api/posts/feed
//   GET    /api/posts/:id
//   DELETE /api/posts/:id
// に対応する実装。

import { evaluateText } from "../lib/aiEvaluate.ts";
import { resolveAccountId } from "../lib/auth.ts";
import { findBubble, listBubbles } from "../lib/bubbles.ts";
import { query } from "../lib/db.ts";
import { error, json, readJson } from "../lib/http.ts";
import { checkRules } from "../lib/moderation.ts";

/** FR-POST-002：最終的に保存されるバブル本文の上限文字数（NFR-005）。 */
const BUBBLE_MAX_LENGTH = 150;

type StampInput = { stampId: string; position?: number };

function parseStamps(value: unknown): StampInput[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const stamps: StampInput[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) return null;
    const stampId = (item as Record<string, unknown>).stampId;
    const position = (item as Record<string, unknown>).position;
    if (typeof stampId !== "string") return null;
    if (position !== undefined && typeof position !== "number") return null;
    stamps.push({ stampId, position });
  }
  return stamps;
}

/**
 * `POST /api/posts`。常に赤ちゃんペルソナとして投稿する（FR-POST-001、FR-POST-003）。
 *
 * 保存前に150文字制限（FR-POST-002）・モデレーション（FR-MOD-003〜005）・
 * AI評価の閾値判定（FR-AI-EVAL-007、NFR-003）を順に通す。クライアントが
 * 送ってきた事前チェック結果は受け取らず、必ずここで再検査する（FR-MOD-004）。
 */
export async function handleCreatePost(req: Request): Promise<Response> {
  const accountId = await resolveAccountId(req);
  if (!accountId) {
    return error("認証が必要です", 401);
  }

  const body = await readJson(req);
  if (body === null) {
    return error("リクエストの形式が正しくありません", 400);
  }

  const text = body.body;
  if (typeof text !== "string") {
    return error("入力内容を確認してください", 422);
  }
  const stamps = parseStamps(body.stamps);
  if (stamps === null) {
    return error("入力内容を確認してください", 422);
  }
  if ([...text].length > BUBBLE_MAX_LENGTH) {
    return error("本文が長すぎます", 422);
  }

  const moderation = checkRules(text);
  if (moderation.action === "block") {
    // 匿名性の保護を理由とすることが伝わる説明にし、判定の内部情報は含めない（FR-MOD-033〜034）。
    return error(
      "えんじいろでは、あなたと他の利用者の匿名性を守るため、個人が特定できる情報・外部連絡先・実際に会うための内容や、攻撃的な表現は投稿できません",
      422,
    );
  }

  const evaluation = evaluateText(text, "baby");
  if (!evaluation.passesThreshold) {
    // NFR-003：AI評価の閾値を超えなかったバブルは保存しない（FR-AI-EVAL-007）。
    return error("いまの内容では投稿できません", 422);
  }

  const personaResult = await query<{ id: string }>(
    "select id from baby_personas where account_id = $1",
    [accountId],
  );
  const babyPersonaId = personaResult.rows[0]?.id;
  if (!babyPersonaId) {
    return error("アカウントの状態を確認できません", 500);
  }

  const postResult = await query<{ id: string }>(
    "insert into posts (baby_persona_id, body) values ($1, $2) returning id",
    [babyPersonaId, text],
  );
  const postId = postResult.rows[0].id;

  for (const stamp of stamps) {
    await query(
      "insert into post_stamps (post_id, stamp_id, position) values ($1, $2, $3)",
      [postId, stamp.stampId, stamp.position ?? null],
    );
  }

  const bubble = await findBubble(postId, accountId);
  return json(bubble, 201);
}

/**
 * `GET /api/posts/feed`。認証は不要（FR-GUEST-001）。
 *
 * ログイン時は閲覧者と近い推定年齢・近い悩みのバブルを`recommended`として優先的に
 * 切り出す想定だが、現時点ではpersona_age_estimatesの集計を実装していないため、
 * 暫定的に`recommended`を空にして`rest`のみ新着順で返す（FR-GUEST-004とも整合する
 * 挙動）。ページングは今回未実装（`docs/design_doc.md` 10章のオープンイシュー）。
 */
export async function handleFeed(req: Request): Promise<Response> {
  const accountId = await resolveAccountId(req);
  const bubbles = await listBubbles(accountId);
  return json({ recommended: [], rest: bubbles, nextCursor: null });
}

/** `GET /api/posts/:id`。認証は不要（FR-GUEST-002）。 */
export async function handleGetPost(
  req: Request,
  id: string,
): Promise<Response> {
  const accountId = await resolveAccountId(req);
  const bubble = await findBubble(id, accountId);
  if (!bubble) {
    return error("バブルが見つかりません", 404);
  }
  return json(bubble);
}

/** `DELETE /api/posts/:id`。自分のバブルのみ削除できる（FR-POST-006〜007）。 */
export async function handleDeletePost(
  req: Request,
  id: string,
): Promise<Response> {
  const accountId = await resolveAccountId(req);
  if (!accountId) {
    return error("認証が必要です", 401);
  }

  const result = await query<{ deleted_at: string }>(
    `update posts p
        set deleted_at = now()
       from baby_personas bp
      where p.id = $1
        and p.baby_persona_id = bp.id
        and bp.account_id = $2
        and p.deleted_at is null
      returning p.deleted_at as deleted_at`,
    [id, accountId],
  );

  const deletedAt = result.rows[0]?.deleted_at;
  if (!deletedAt) {
    return error("バブルが見つかりません", 404);
  }
  return json({ deletedAt });
}
