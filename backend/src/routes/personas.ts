// docs/design_doc.md 7章「API設計」の
//   GET /api/personas/baby/:id
//   GET /api/personas/mother/:id
// に対応する実装。

import { resolveAccountId } from "../lib/auth.ts";
import { query } from "../lib/db.ts";
import { error, json } from "../lib/http.ts";

type PersonaKind = "baby" | "mother";

/**
 * 他人から見える公開プロフィール（FR-PROFILE-005）。
 *
 * `accountId`・生年月日・もう一方のペルソナへの導線は一切含めない
 * （FR-PERSONA-003〜004、FR-PRIV-007）。推定年齢（`status`）を含めるかは
 * PO判断待ち（Issue #30 A-3）のため、現時点では含めていない。
 */
export async function handleGetPublicPersona(
  req: Request,
  kind: PersonaKind,
  id: string,
): Promise<Response> {
  const viewerAccountId = await resolveAccountId(req);

  const table = kind === "baby" ? "baby_personas" : "mother_personas";
  const result = await query<
    { id: string; nickname: string; account_id: string }
  >(
    `select id, nickname, account_id from ${table} where id = $1`,
    [id],
  );
  const persona = result.rows[0];
  if (!persona) {
    return error("ペルソナが見つかりません", 404);
  }

  let liked = false;
  if (viewerAccountId) {
    const likedResult = await query(
      `select 1 from follows
        where follower_account_id = $1
          and target_persona_type = $2
          and target_persona_id = $3`,
      [viewerAccountId, kind, id],
    );
    liked = likedResult.rows.length > 0;
  }

  return json({
    persona: { id: persona.id, kind, nickname: persona.nickname },
    liked,
    isMe: viewerAccountId !== null && persona.account_id === viewerAccountId,
  });
}
