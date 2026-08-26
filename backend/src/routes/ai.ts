import { resolveAccountId } from "../lib/auth.ts";
import { evaluateText, type PersonaKind } from "../lib/aiEvaluate.ts";
import { error, json, readJson } from "../lib/http.ts";

function isPersonaKind(value: unknown): value is PersonaKind {
  return value === "baby" || value === "mother";
}

/**
 * `POST /api/ai/evaluate`。
 *
 * FR-AI-003 / FR-PRIV-003：AI処理へ利用者識別情報を渡さない。認証は
 * 「未認証なら拒否する」ためだけに使い、accountIdを評価ロジックへは渡さない。
 */
export async function handleEvaluate(req: Request): Promise<Response> {
  const accountId = await resolveAccountId(req);
  if (!accountId) {
    return error("認証が必要です", 401);
  }

  const body = await readJson(req);
  if (body === null) {
    return error("リクエストの形式が正しくありません", 400);
  }

  const { body: text, personaKind } = body;
  if (typeof text !== "string" || !isPersonaKind(personaKind)) {
    return error("入力内容を確認してください", 422);
  }

  const result = evaluateText(text, personaKind);
  return json(result);
}
