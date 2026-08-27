// docs/design_doc.md 7章「API設計」の
//   POST /api/ai/evaluate
//   POST /api/ai/transform
// に対応する、フロントエンド向けの公開口。内部でai/ (Python) 推論APIを呼び出す
// （aiClient.ts）。閾値判定・モデレーションはbackend側の責務（FR-AI-EVAL-008）。
//
// AI処理へアカウントID等の識別情報を渡さない（FR-AI-003、FR-PRIV-003）。

import { resolveAccountId } from "../lib/auth.ts";
import { callAiEvaluate, callAiTransform } from "../lib/aiClient.ts";
import { checkModeration } from "../lib/moderation.ts";
import { error, json, readJson } from "../lib/http.ts";

export async function handleAiEvaluate(req: Request): Promise<Response> {
  const accountId = await resolveAccountId(req);
  if (!accountId) return error("認証が必要です。", 401);

  const body = await readJson(req);
  if (!body) return error("リクエストの形式が正しくありません。", 400);

  const text = body.body;
  const personaType = body.personaType;
  if (
    typeof text !== "string" ||
    (personaType !== "baby" && personaType !== "mother")
  ) {
    return error("bodyとpersonaTypeを指定してください。", 400);
  }

  const result = await callAiEvaluate(text, personaType);
  if (result === null) {
    return error("AI評価サービスが利用できません。", 503);
  }

  // 「はかる」ボタンでは合否を出さず指標だけを見せる想定（feat-ui-profileブランチの
  // CLAUDE.md記載の運用方針）だが、design_doc.md 7.1章のレスポンス例はpassesThresholdを
  // 含む形なので契約通り返す。閾値の具体的な初期値は未確定のため、常にtrueを返す仮実装
  // （backend/src/lib/contentGate.tsのpassesThresholdと同じ仮ルール）。
  return json({
    estimatedAge: result.estimatedAge,
    passesThreshold: true,
  });
}

export async function handleAiTransform(req: Request): Promise<Response> {
  const accountId = await resolveAccountId(req);
  if (!accountId) return error("認証が必要です。", 401);

  const body = await readJson(req);
  if (!body) return error("リクエストの形式が正しくありません。", 400);

  const text = body.body;
  const style = body.style;
  if (typeof text !== "string" || (style !== "baby" && style !== "mother")) {
    return error("bodyとstyleを指定してください。", 400);
  }

  // 変換前の入力を検査する（FR-MOD-001）。
  const inputVerdict = checkModeration(text);
  if (inputVerdict.action === "block") {
    return json({
      action: "block",
      transformedText: null,
      reasonCodes: inputVerdict.reasonCodes,
    });
  }

  const result = await callAiTransform(text, style);
  if (result === null) {
    // AI文章変換（生成）が止まっても、バブル・あやすの投稿機能自体は継続できる
    // （NFR-001）。ここでは変換機能単体が利用不可であることを伝える。
    return error("AI文章変換サービスが利用できません。", 503);
  }

  // 変換後の出力も検査する（FR-MOD-002）。
  const outputVerdict = checkModeration(result.transformedText);
  const finalAction = inputVerdict.action === "rewrite_required" ||
      outputVerdict.action === "rewrite_required"
    ? "rewrite_required"
    : outputVerdict.action;

  if (finalAction === "block") {
    return json({
      action: "block",
      transformedText: null,
      reasonCodes: outputVerdict.reasonCodes,
    });
  }

  return json({
    action: finalAction,
    transformedText: result.transformedText,
    reasonCodes: [
      ...new Set([...inputVerdict.reasonCodes, ...outputVerdict.reasonCodes]),
    ],
  });
}
