// バブル・あやすの保存前に必ず通す検査（AI評価の閾値判定＋モデレーション）をまとめる。
// docs/design_doc.md 3.5-7、FR-AI-EVAL-007、NFR-003〜004、9.2章に対応。
//
// - AI評価が応答しない場合は閾値判定ができないため、保存自体を止める（NFR-003）。
// - モデレーションを経ていない本文は保存しない（NFR-004）。
// - クライアントが送ってきた事前チェック結果は信用せず、必ずサーバ側で検査する（FR-MOD-004）。

import { callAiEvaluate } from "./aiClient.ts";
import { checkModeration } from "./moderation.ts";

export interface GateResult {
  ok: boolean;
  /** 拒否理由。design_doc.md FR-MOD-033〜034に従い、内部の判定コードや辞書内容は含めない。 */
  publicMessage?: string;
  /**
   * 画面側の表示の出し分け用の粗い区分。design_doc.mdのエラーレスポンス例には無いが、
   * NGワード辞書の内容など内部情報は含まないため、FR-MOD-033〜034とは抵触しない
   * （実装フェーズの補完。frontendのCreateBubbleResult.reasonと対応させる）。
   */
  reason?: "too_long" | "moderation" | "evaluation" | "ai_unavailable";
  /** 通過した場合のAI評価結果。persona_age_estimatesの集計に使う。 */
  estimatedAge?: number;
}

export async function checkPostable(
  body: string,
  personaType: "baby" | "mother",
): Promise<GateResult> {
  if (body.length > 150) {
    return {
      ok: false,
      reason: "too_long",
      publicMessage: "本文は150文字以内にしてください。",
    };
  }

  const evaluation = await callAiEvaluate(body, personaType);
  if (evaluation === null) {
    // NFR-003：評価が使えない状態では保存自体を止める。呼び出し側でHTTP 503として返す。
    return {
      ok: false,
      reason: "ai_unavailable",
      publicMessage:
        "現在、投稿内容を確認する処理が利用できないため保存できません。しばらくしてからもう一度お試しください。",
    };
  }

  if (!evaluation.passesThreshold) {
    return {
      ok: false,
      reason: "evaluation",
      publicMessage:
        "匿名性保護のため、この内容は保存できませんでした。表現を見直してもう一度お試しください。",
    };
  }

  const moderation = checkModeration(body);
  if (moderation.action !== "allow") {
    return {
      ok: false,
      reason: "moderation",
      publicMessage:
        "匿名性保護のため、この内容は保存できませんでした。表現を見直してもう一度お試しください。",
    };
  }

  return { ok: true, estimatedAge: evaluation.estimatedAge };
}
