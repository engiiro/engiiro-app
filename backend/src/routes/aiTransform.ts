import { type TransformStyle, transformText } from "../lib/aiTransform.ts";
import { resolveAccountId } from "../lib/auth.ts";
import { error, json, readJson } from "../lib/http.ts";

function isTransformStyle(value: unknown): value is TransformStyle {
  return value === "baby" || value === "mother";
}

/**
 * `POST /api/ai/transform`。
 *
 * FR-AI-003 / FR-PRIV-003：AI処理へ利用者識別情報を渡さない。認証は
 * 「未認証なら拒否する」ためだけに使い、accountIdを変換ロジックへは渡さない。
 * FR-AI-TRANS-006：変換結果はここでは保存しない。呼び出し側（利用者）が
 * 確認・編集したうえでバブル・あやすの作成APIへ改めて送る。
 */
export async function handleTransform(req: Request): Promise<Response> {
  const accountId = await resolveAccountId(req);
  if (!accountId) {
    return error("認証が必要です", 401);
  }

  const body = await readJson(req);
  if (body === null) {
    return error("リクエストの形式が正しくありません", 400);
  }

  const { body: text, style } = body;
  if (typeof text !== "string" || !isTransformStyle(style)) {
    return error("入力内容を確認してください", 422);
  }

  const result = transformText(text, style);
  return json(result);
}
