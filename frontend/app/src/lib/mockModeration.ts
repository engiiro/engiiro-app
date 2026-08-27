/*
 * 偽のモデレーション。
 *
 * 判定基準は「その内容から個人を特定・連絡・現実世界で接触できるか」（FR-MOD-010）。
 * 本人の情報でも第三者の情報でも同じく禁止（FR-MOD-011）。
 *
 * ここが返すのは可否だけ。
 * 理由コード・辞書の中身・マッチした文字列を呼び出し側へ渡さない（FR-MOD-034 / FR-PRIV-006 /
 * FR-AI-TRANS-009）。渡せる形にしておくと、いつか画面に出てしまう。
 *
 * 本物の判定は backend の担当。フロントのこの判定は保証にはならない
 * （FR-MOD-004：クライアントの申告した判定結果を信用しない）。
 */

export type ModerationVerdict = "ok" | "violation";

/**
 * 個人の特定・連絡・接触につながる形。
 * このリストは外に出さない（export しない）。
 */
const IDENTITY_RISK_PATTERNS: readonly RegExp[] = [
  // URL は MVP では本文に含められない（FR-MOD-021 / OUT-008）
  /https?:\/\//i,
  /www\./i,
  /[\w-]+\.(?:com|net|org|jp|io|dev|me|co)\b/i,
  // メールアドレス・電話番号（FR-MOD-014）
  /[\w.+-]+@[\w-]+\.[a-z]{2,}/i,
  /0\d{1,4}-\d{1,4}-\d{3,4}/,
  /\b0[789]0\d{8}\b/,
  // 外部サービスのアカウント・招待コード（FR-MOD-015）
  /@[A-Za-z0-9_]{3,}/,
  /招待コード/,
  // 外部での連絡への誘導（FR-MOD-016 / FR-MOD-017）
  /連絡先/,
  /れんらくさき/,
  /個別に(?:連絡|れんらく)/,
  /(?:メール|でんわ|電話|DM|ＤＭ)(?:して|ください|くれ|送)/,
  /(?:LINE|ライン|インスタ|Discord|ディスコード)(?:で|の|に|おしえ|教え)/i,
  // 現実世界での接触・待ち合わせ・集会（FR-MOD-018）
  /待ち合わせ/,
  /待ってる/,
  /会(?:って|おう|いに|いましょ)/,
  /集ま(?:ろう|りませんか)/,
  /オフ会/,
  /改札/,
  // 住所・建物・部屋番号（FR-MOD-013）
  /〒/,
  /\d+丁目/,
  /\d+番地/,
  /\d+号室/,
];

/**
 * 攻撃的・否定的な表現（マサカリ表現、FR-MOD-023）。
 * 個人は特定できないが、そのままでは利用させない側。
 * 「ばかり」を「ばか」で拾わないよう、否定の先読みを入れている。
 */
const HARSH_PATTERNS: readonly RegExp[] = [
  /ばか(?!り)/,
  /バカ/,
  /無能/,
  /アホ/,
  /クソ|くそ(?!ねむい)/,
  /死ね/,
  /(?:使えない|いらない)(?:やつ|人間|人)/,
  /(?:やつ|あいつ).{0,6}(?:なんじゃないの|だろ|でしょ)/,
];

/** 個人の特定・連絡・接触につながる内容か */
export function moderate(text: string): ModerationVerdict {
  const normalized = normalize(text);
  return IDENTITY_RISK_PATTERNS.some((pattern) => pattern.test(normalized)) ? "violation" : "ok";
}

/** 攻撃的・否定的な表現を含むか（FR-MOD-023）。`block` ではなく書き換えを促す側 */
export function containsHarshExpression(text: string): boolean {
  const normalized = normalize(text);
  return HARSH_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * 伏せ字・全角半角のゆらぎで判定をすり抜けるのを、ほんの少しだけ抑える。
 * 正式な正規化の規則は未確定（docs/design_doc.md §7.1 の注記）。
 */
function normalize(text: string): string {
  return text.normalize("NFKC").replace(/[\s　]+/g, "");
}
