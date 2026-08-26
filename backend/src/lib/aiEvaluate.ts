/**
 * AI文章評価の簡易ルールベース実装（暫定）。
 *
 * design_doc.md 8章「AI評価・AI文章変換は最初は簡易ロジックで良く、後から
 * モデルに差し替えられる設計にしておく」に従い、`/api/ai/evaluate`の
 * インターフェース（{ estimatedAge, passesThreshold }）だけを固定し、
 * 中身は文字パターンによる簡易判定にしている。ai/配下の本物のAI評価
 * （PyTorch/scikit-learn等）に差し替える際は、この関数の中身だけを
 * 差し替えれば良い（呼び出し側のroutes/ai.tsは変更不要）。
 *
 * FR-AI-EVAL-002：赤ちゃんとお母さんは評価軸が異なるため、別の関数で判定する。
 */

/**
 * 保存を許す上限の月齢。閾値はサーバ側のみが保持する（FR-AI-EVAL-008）。
 * 3歳（36か月）以下を通す暫定値。design_doc.md 10章のオープンイシューで未確定。
 */
const PASS_THRESHOLD_MONTHS = 36;

const MAX_MONTHS = 216; // 18歳相当を上限にクランプする

/** ひらがな・カタカナの文字数の割合。幼い文章ほど高くなりやすい、という簡易な仮定。 */
function kanaRatio(text: string): number {
  const chars = [...text];
  if (chars.length === 0) return 0;
  const kana = chars.filter((ch) => /[ぁ-ゖァ-ヺ]/.test(ch));
  return kana.length / chars.length;
}

/** 幼児退行した文章によく出る語尾・語彙。含まれるほど「幼い」と判定する。 */
const BABY_PATTERNS = [
  /ばぶ/,
  /おぎゃ/,
  /でちゅ/,
  /なのー/,
  /ちゃった/,
  /わたち/,
  /ぼくちゃん/,
  /ねむいよぉ/,
];

/** お母さん・ママ口調によく出る、相手をいたわる語彙。含まれるほど「幼い相手に向けている」と判定する。 */
const MOTHER_PATTERNS = [
  /よしよし/,
  /えらいね/,
  /がんばったね/,
  /だいじょうぶ/,
  /おつかれさま/,
  /よくがんばった/,
];

/**
 * 赤ちゃんとしての文章の幼さを評価する（FR-AI-EVAL-003）。
 * 対象は文章そのもの。ひらがな比率・幼児語パターン・文字数から月齢の目安を出す。
 */
export function evaluateBabyMonths(body: string): number {
  let months = 60; // 基準値：5歳相当から始め、幼さの手がかりに応じて下げる

  const ratio = kanaRatio(body);
  if (ratio > 0.9) months -= 24;
  else if (ratio > 0.7) months -= 12;

  const hits = BABY_PATTERNS.filter((pattern) => pattern.test(body)).length;
  months -= hits * 10;

  const length = [...body].length;
  if (length > 100) months += 12; // 長い整った文章は幼さの手がかりとして弱い

  return clampMonths(months);
}

/**
 * お母さんとしての文章が向けている相手の年齢を評価する（FR-AI-EVAL-004）。
 * 対象は文章そのものではなく、その優しさ・労いの度合い。
 */
export function evaluateMotherMonths(body: string): number {
  let months = 84; // 基準値：7歳相当から始め、労いの手がかりに応じて下げる

  const hits = MOTHER_PATTERNS.filter((pattern) => pattern.test(body)).length;
  months -= hits * 15;

  // 命令形・断定的な語尾（「〜しろ」「〜するな」）は労いから遠いとみなし、対象年齢を上げる
  if (/(しろ|するな|やめろ)/.test(body)) months += 24;

  return clampMonths(months);
}

function clampMonths(months: number): number {
  return Math.max(0, Math.min(MAX_MONTHS, Math.round(months)));
}

export type PersonaKind = "baby" | "mother";

export type EvaluateResult = {
  readonly estimatedAge: number;
  readonly passesThreshold: boolean;
};

/** `POST /api/ai/evaluate`の中身。design_doc.md 7.2章の`estimatedAge`・`passesThreshold`に対応する。 */
export function evaluateText(
  body: string,
  personaKind: PersonaKind,
): EvaluateResult {
  const months = personaKind === "baby"
    ? evaluateBabyMonths(body)
    : evaluateMotherMonths(body);
  return {
    estimatedAge: months,
    passesThreshold: months <= PASS_THRESHOLD_MONTHS,
  };
}
