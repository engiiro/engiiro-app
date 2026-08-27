// docs/design_doc.md 7章「API設計」の
//   POST /api/posts/:id/comments
//   GET  /api/posts/:id/comments
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

interface CommentReactionAggRow {
  target_comment_id: string;
  type: string;
  count: string;
}

export async function handleListComments(
  _req: Request,
  params: Record<string, string | undefined>,
): Promise<Response> {
  const postId = params.id;
  if (!postId) return error("idを指定してください。", 400);

  const result = await query<CommentRow>(
    `select * from comments
     where post_id = $1 and deleted_at is null
     order by created_at asc`,
    [postId],
  );

  // design_doc.md 7章のレスポンス例には無いフィールドだが、あやす一覧を
  // 表示するfrontendがリアクション件数を都度個別取得せずに済むよう、
  // 一覧取得時にまとめて返す（実装フェーズの補完、既存クライアントには影響しない）。
  const reactionResult = await query<CommentReactionAggRow>(
    `select target_comment_id, type, count(*) as count
     from reactions
     where target_type = 'comment' and target_comment_id = any($1)
     group by target_comment_id, type`,
    [result.rows.map((c: CommentRow) => c.id)],
  );
  const reactionCountsByComment = new Map<string, Record<string, number>>();
  for (const r of reactionResult.rows) {
    const counts = reactionCountsByComment.get(r.target_comment_id) ?? {};
    counts[r.type] = Number(r.count);
    reactionCountsByComment.set(r.target_comment_id, counts);
  }

  return json({
    comments: result.rows.map((c: CommentRow) => ({
      id: c.id,
      personaType: c.persona_type,
      personaId: c.persona_type === "baby"
        ? c.baby_persona_id
        : c.mother_persona_id,
      body: c.body,
      replyToCommentId: c.reply_to_comment_id ?? undefined,
      createdAt: c.created_at,
      reactionCounts: reactionCountsByComment.get(c.id) ?? {},
    })),
  });
}
