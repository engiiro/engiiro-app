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
 *   FR-AI-EVAL-006  評価の結果で投稿の可否を判定しない（呼び出し側の責務）
 *
 * 中身は差し替え前提のプレースホルダー。ai/src/evaluate.py と同じ立場。
 */

export type AiEvaluateResult = {
  /** 何歳何か月相当か。0〜72 か月の範囲に収める */
  readonly months: number;
  /** 画面に出す文字。バーだけで伝えないための数値（DESIGN.md §4 Meter） */
  readonly label: string;
  /** 軸の名前。赤ちゃんとお母さんで意味が違うことを画面でも示す */
  readonly axis: string;
};

const MAX_MONTHS = 72;
const MOCK_THINKING_MS = 800;

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

  const months =
    personaKind === "baby" ? babyMonths(text) : motherTargetMonths(text);
  return {
    months,
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
