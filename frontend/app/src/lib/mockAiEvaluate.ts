import type { PersonaKind } from "../data/types";
import { AiUnavailableError } from "./mockAiTransform";

/*
 * 偽の AI 文章評価（POST /api/ai/evaluate の代わり）。
 *
 * 守っているのは形だけ：
 *   FR-AI-EVAL-001  文章から年齢の目安を返す
 *   FR-AI-EVAL-002  赤ちゃんとお母さんの評価軸は異なる。同じ尺度の値として扱わない
 *   FR-AI-EVAL-003  赤ちゃんの評価は、その文章自体の幼さ
 *   FR-AI-EVAL-004  お母さんの評価は、その文章が向けられている相手の年齢
 *   FR-AI-EVAL-005  評価は変換を行わない。結果に変換後の文章を含めない
 *   FR-AI-EVAL-007  閾値を超えなかったバブル・あやすは投稿できない（2026-08-25 の PO 改訂）
 *   NFR-003         評価が使えない場合は投稿を妨げる（同上。以前とは逆）
 *
 * 中身は差し替え前提のプレースホルダー。ai/src/evaluate.py と同じ立場。
 */

export type AiEvaluateResult = {
  /** 何歳何か月相当か。0〜72 か月の範囲に収める */
  readonly months: number;
  /** 閾値を満たしたか。false のものは投稿できない（FR-AI-EVAL-007） */
  readonly passed: boolean;
  /** 画面に出す文字。バーだけで伝えないための数値（DESIGN.md §4 Meter） */
  readonly label: string;
  /** 軸の名前。赤ちゃんとお母さんで意味が違うことを画面でも示す */
  readonly axis: string;
};

const MAX_MONTHS = 72;
const MOCK_THINKING_MS = 800;

/**
 * 投稿を許す上限の月齢（仮の値）。
 *
 * FR-AI-EVAL-007 は「ある一定の閾値」としか書いておらず、値が決まっていない。
 * 赤ちゃんは文章自体の幼さ、お母さんは向けている相手の年齢なので、
 * どちらも「低いほど それらしい」。3歳（36か月）以下を通す仮置き。
 * backend と揃えるべき数値なので、決まったらここだけ直す。
 */
export const EVALUATE_PASS_MAX_MONTHS = 36;

export async function mockAiEvaluate(
  text: string,
  personaKind: PersonaKind,
  options: { readonly available: boolean },
): Promise<AiEvaluateResult> {
  if (!options.available) {
    throw new AiUnavailableError();
  }
  await new Promise((resolve) => {
    setTimeout(resolve, MOCK_THINKING_MS);
  });

  const months = personaKind === "baby" ? babyMonths(text) : motherTargetMonths(text);
  return {
    months,
    passed: months <= EVALUATE_PASS_MAX_MONTHS,
    label: monthsToLabel(months),
    axis: personaKind === "baby" ? "赤ちゃん度（文章の幼さ）" : "お母さん度（向けている相手の年齢）",
  };
}

/**
 * 赤ちゃん度：文章そのものの幼さ。
 * 幼い表現ほど低い月齢になる（FR-AI-EVAL-003）。
 */
function babyMonths(text: string): number {
  let score = 40;
  const childish = ["ぉ", "ぁ", "ばぶ", "おぎゃ", "ねむねむ", "だっこ", "ぷに", "…", "ぐすん"];
  const grown = ["設計", "実装", "レビュー", "対応", "仕様", "検討", "です", "ます"];
  for (const word of childish) {
    if (text.includes(word)) {
      score -= 6;
    }
  }
  for (const word of grown) {
    if (text.includes(word)) {
      score += 5;
    }
  }
  // ひらがなの比率が高いほど幼く見える
  const kana = (text.match(/[ぁ-ん]/g) ?? []).length;
  const ratio = text.length === 0 ? 0 : kana / text.length;
  score -= Math.round(ratio * 24);
  return clamp(score);
}

/**
 * お母さん度：その文章が向けられている相手の年齢（FR-AI-EVAL-004）。
 * 赤ちゃん度とは別の軸なので、同じ尺度の値として扱わない。
 */
function motherTargetMonths(text: string): number {
  let score = 30;
  const soothing = ["よしよし", "えらい", "だいじょうぶ", "ねようね", "がんばったね", "いい子"];
  const grownUp = ["ですね", "ましょう", "対応", "確認", "お疲れさま"];
  for (const word of soothing) {
    if (text.includes(word)) {
      score -= 5;
    }
  }
  for (const word of grownUp) {
    if (text.includes(word)) {
      score += 7;
    }
  }
  return clamp(score);
}

function clamp(months: number): number {
  return Math.max(0, Math.min(MAX_MONTHS, months));
}

function monthsToLabel(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) {
    return String(rest) + "か月";
  }
  return rest === 0 ? String(years) + "歳" : String(years) + "歳" + String(rest) + "か月";
}

export { MAX_MONTHS };
