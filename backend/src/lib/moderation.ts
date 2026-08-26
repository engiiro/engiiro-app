/**
 * 規則ベースのモデレーション（NG辞書・伏字回避の正規化・個人情報検出）。
 *
 * ai/moderation_rules.py の判定ロジックをTypeScriptへ移植した暫定実装。
 * マサカリ表現の扱いは、ai/moderation_rules.py が実装した時点では
 * `rewrite_required` だったが、その後の人間監督の決定でPython側・
 * design_doc.md（FR-MOD-023）ともに`block`へ変更されている。この移植では
 * 最新の仕様（block）に合わせている。
 *
 * design_doc.md 9.2章「保存時に、最終的に保存される本文をモデレーションの
 * 対象とすること」（FR-MOD-003）に対応する、保存前チェックとして使う。
 */

/** やわらげても投稿させないもの（人間が運用で育てる前提の初期値、AIが勝手に増やさない）。 */
const NG_WORDS_BLOCK = [
  "死ね",
  "しね",
  "殺す",
  "ころす",
  "消えろ",
  "きえろ",
  "キチガイ",
  "きちがい",
  "ガイジ",
  "がいじ",
];

/**
 * マサカリ寄りの語。文脈を見ないと誤検出しやすい語（バカ・クズ・カス・ゴミ等）は、
 * ひらがなにそろえると「ばかり」「くずれる」「貸す」「申し込み」に一致してしまうため
 * 意図的に含めていない（ai/moderation_rules.pyと同じ判断）。
 */
const NG_WORDS_HARSH = ["無能", "役立たず"];

/** 自傷・他害の疑い。TBD-9（専用応答の設計）が未確定のため、検出して理由コードを立てるだけにする。 */
const SELF_HARM_WORDS = [
  "死にたい",
  "しにたい",
  "消えたい",
  "きえたい",
  "自殺",
  "リストカット",
  "リスカ",
];

const INVISIBLE_PATTERN = /[​-‏‪-‮⁠-⁤﻿]/g;
const MASK_CHARS = "○●◯〇◎＊*✳✱×✕╳・･.,、。_＿-－ー‐―~〜^ 　\t";
// 文字クラス内では `-` も範囲指定として解釈されるため、他のメタ文字と同様にエスケープする。
const MASK_PATTERN = new RegExp(
  "[" + MASK_CHARS.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&") + "]+",
  "g",
);

/**
 * 判定用の文字列を作る。表示には使わない。
 *
 * - NFKCで全角英数字・半角カナ等をそろえる
 * - 幅ゼロ文字を落とす
 * - 伏字記号を落として「し ね」「し○ね」を「しね」にする
 * - 3文字以上の繰り返しを2文字にたたむ
 * - カタカナをひらがなにそろえる
 *
 * 濁点は落とさない。落とすと「ダメ」が「ため」になるなど誤検出のほうが
 * 害が大きいため（ai/moderation_rules.pyと同じ判断）。「し゛ね」のような
 * 濁点を使った回避はこの関数では防げない。
 */
export function normalizeForCheck(text: string): string {
  if (!text) return "";
  let normalized = text.normalize("NFKC");
  normalized = normalized.replace(INVISIBLE_PATTERN, "");
  normalized = normalized.toLowerCase();
  normalized = normalized.replace(MASK_PATTERN, "");
  normalized = normalized.replace(/(.)\1{2,}/g, "$1$1");
  normalized = [...normalized].map((ch) => {
    const code = ch.codePointAt(0)!;
    // カタカナ（ァ-ヶ）→ ひらがな
    return code >= 0x30a1 && code <= 0x30f6
      ? String.fromCodePoint(code - 0x60)
      : ch;
  }).join("");
  return normalized;
}

/** ソースコードやツールでよく使う拡張子。URL誤検出を避けるための除外リスト（Issue #11）。 */
const TECH_SUFFIXES = new Set([
  "js",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "jsx",
  "vue",
  "svelte",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "kt",
  "php",
  "cs",
  "swift",
  "json",
  "yaml",
  "yml",
  "toml",
  "ini",
  "cfg",
  "conf",
  "lock",
  "env",
  "md",
  "txt",
  "csv",
  "tsv",
  "sql",
  "sh",
  "bat",
  "ps1",
  "html",
  "css",
  "scss",
  "sass",
  "less",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "svg",
  "gif",
  "ico",
  "log",
  "tmp",
  "bak",
  "map",
  "min",
]);

const TECH_NAMES = new Set([
  "react.js",
  "next.js",
  "node.js",
  "vue.js",
  "nuxt.js",
  "three.js",
  "express.js",
  "d3.js",
  "chart.js",
  "socket.io",
  "vite.js",
]);

const URL_SCHEME_PATTERN = /https?:\/\/\S+/i;
const DOT_TOKEN_PATTERN = /[0-9a-z_-]+(?:\.[0-9a-z_-]+)+/gi;
const EMAIL_PATTERN = /[0-9a-z._%+-]+@[0-9a-z.-]+\.[a-z]{2,}/i;
const PHONE_PATTERN = /0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}/;
const POSTAL_PATTERN = /\d{3}-\d{4}/;
const ACCOUNT_ID_PATTERN = /(?<![0-9a-z])@[0-9a-z_]{3,}/i;

function looksLikeTechTerm(token: string): boolean {
  const lowered = token.toLowerCase();
  if (TECH_NAMES.has(lowered)) return true;
  const suffix = lowered.split(".").pop() ?? "";
  return TECH_SUFFIXES.has(suffix);
}

export type PersonalDataKind =
  | "email"
  | "url"
  | "phone"
  | "postal_code"
  | "account_id";

/**
 * 個人が特定できる情報を探す。正規化前の原文に対して行う
 * （正規化すると電話番号のハイフンやメールのドットが消え、かえって検出できなくなるため）。
 */
export function findPersonalData(text: string): PersonalDataKind[] {
  const found = new Set<PersonalDataKind>();

  if (EMAIL_PATTERN.test(text)) found.add("email");

  if (URL_SCHEME_PATTERN.test(text)) {
    found.add("url");
  } else {
    for (const token of text.match(DOT_TOKEN_PATTERN) ?? []) {
      if (
        EMAIL_PATTERN.test(token) && EMAIL_PATTERN.exec(token)?.[0] === token
      ) continue;
      if (!looksLikeTechTerm(token)) {
        found.add("url");
        break;
      }
    }
  }

  // 電話番号を先に見る。郵便番号の形（3桁-4桁）は電話番号の後半にも一致するため。
  if (PHONE_PATTERN.test(text)) {
    found.add("phone");
  } else if (POSTAL_PATTERN.test(text)) {
    found.add("postal_code");
  }

  if (ACCOUNT_ID_PATTERN.test(text)) found.add("account_id");

  return [...found].sort();
}

export type ModerationAction = "allow" | "block";

export type ModerationVerdict = {
  readonly action: ModerationAction;
  readonly reasonCodes: readonly string[];
};

function includesNormalized(haystack: string, word: string): boolean {
  return haystack.includes(normalizeForCheck(word));
}

/**
 * 規則ベースの判定をまとめて行う。
 *
 * design_doc.mdの確定仕様では`rewrite_required`は存在せず、NG語・自傷他害・
 * 個人情報・マサカリのいずれも検出時は`block`に統一する（FR-MOD-023、
 * FR-MOD-030）。理由コードだけは種別ごとに残し、フロントの表示分けに使えるようにする。
 */
export function checkRules(text: string): ModerationVerdict {
  const checked = normalizeForCheck(text);

  const hitBlock = NG_WORDS_BLOCK.some((word) =>
    includesNormalized(checked, word)
  );
  const hitHarsh = NG_WORDS_HARSH.some((word) =>
    includesNormalized(checked, word)
  );
  const hitSelfHarm = SELF_HARM_WORDS.some((word) =>
    includesNormalized(checked, word)
  );
  const personal = findPersonalData(text);

  const reasonCodes: string[] = [];
  if (hitBlock) reasonCodes.push("ng_word");
  if (hitSelfHarm) reasonCodes.push("self_harm");
  if (personal.length > 0) reasonCodes.push("personal_data");
  if (hitHarsh) reasonCodes.push("harsh_criticism");

  const action: ModerationAction =
    hitBlock || hitSelfHarm || personal.length > 0 || hitHarsh
      ? "block"
      : "allow";

  return { action, reasonCodes: [...new Set(reasonCodes)].sort() };
}
