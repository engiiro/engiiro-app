// docs/design_doc.md 7章「API設計」の
//   POST /api/posts/:id/comments
//   GET  /api/posts/:id/comments
// に対応する実装。

import { evaluateText } from "../lib/aiEvaluate.ts";
import { resolveAccountId } from "../lib/auth.ts";
import { findBubble } from "../lib/bubbles.ts";
import { query } from "../lib/db.ts";
import { error, json, readJson } from "../lib/http.ts";
import { checkRules } from "../lib/moderation.ts";
import { findComment, findSoothe, listDirectSoothes } from "../lib/soothes.ts";

type PersonaKind = "baby" | "mother";

function isPersonaKind(value: unknown): value is PersonaKind {
  return value === "baby" || value === "mother";
}

/**
 * `POST /api/posts/:id/comments`。あやすの発信ペルソナはトークンの`accountId`と
 * `personaKind`から解決するため、`personaId`はリクエストに含めない。
 *
 * お母さんとしてのあやすへ返信する場合、選択できるのは赤ちゃんペルソナのみ
 * （FR-COMMENT-005〜007）。画面上の非表示だけに頼らず、ここでも必ず検証する
 * （FR-COMMENT-006：クライアントを改変した不正な要求も拒否する）。
 */
export async function handleCreateSoothe(
  req: Request,
  postId: string,
): Promise<Response> {
  const accountId = await resolveAccountId(req);
  if (!accountId) {
    return error("認証が必要です", 401);
  }

  const bubble = await findBubble(postId, accountId);
  if (!bubble) {
    return error("バブルが見つかりません", 404);
  }

  const body = await readJson(req);
  if (body === null) {
    return error("リクエストの形式が正しくありません", 400);
  }

  const { personaKind, body: text, replyToSootheId } = body;
  if (
    !isPersonaKind(personaKind) || typeof text !== "string" ||
    text.trim().length === 0
  ) {
    return error("入力内容を確認してください", 422);
  }
  if (replyToSootheId !== undefined && typeof replyToSootheId !== "string") {
    return error("入力内容を確認してください", 422);
  }

  if (replyToSootheId) {
    const replyTarget = await findComment(replyToSootheId);
    if (
      !replyTarget || replyTarget.deletedAt !== null ||
      replyTarget.postId !== postId
    ) {
      return error("返信先のあやすが見つかりません", 404);
    }
    if (replyTarget.personaType === "mother" && personaKind !== "baby") {
      // FR-COMMENT-006：お母さんとしてのあやすへの返信は赤ちゃんペルソナのみ。
      return error("この相手には赤ちゃんペルソナでのみ返信できます", 422);
    }
  }

  const moderation = checkRules(text);
  if (moderation.action === "block") {
    return error(
      "えんじいろでは、あなたと他の利用者の匿名性を守るため、個人が特定できる情報・外部連絡先・実際に会うための内容や、攻撃的な表現は投稿できません",
      422,
    );
  }

  const evaluation = evaluateText(text, personaKind);
  if (!evaluation.passesThreshold) {
    return error("いまの内容では投稿できません", 422);
  }

  const personaTable = personaKind === "baby"
    ? "baby_personas"
    : "mother_personas";
  const personaResult = await query<{ id: string }>(
    `select id from ${personaTable} where account_id = $1`,
    [accountId],
  );
  const personaId = personaResult.rows[0]?.id;
  if (!personaId) {
    return error("アカウントの状態を確認できません", 500);
  }

  const insertResult = await query<{ id: string }>(
    personaKind === "baby"
      ? `insert into comments (post_id, persona_type, baby_persona_id, reply_to_comment_id, body)
         values ($1, 'baby', $2, $3, $4) returning id`
      : `insert into comments (post_id, persona_type, mother_persona_id, reply_to_comment_id, body)
         values ($1, 'mother', $2, $3, $4) returning id`,
    [postId, personaId, replyToSootheId ?? null, text],
  );

  const soothe = await findSoothe(insertResult.rows[0].id, accountId);
  return json(soothe, 201);
}

/**
 * `GET /api/posts/:id/comments`。認証は不要（FR-GUEST-002）。
 * バブルに直接ついたあやすだけを返す。あやすへの返信は含まない
 * （design_doc.md 7.2章。返信一覧の口は10章のオープンイシュー）。
 */
export async function handleListSoothes(
  req: Request,
  postId: string,
): Promise<Response> {
  const accountId = await resolveAccountId(req);
  const bubble = await findBubble(postId, accountId);
  if (!bubble) {
    return error("バブルが見つかりません", 404);
  }
  const soothes = await listDirectSoothes(postId, accountId);
  return json({ soothes });
}
