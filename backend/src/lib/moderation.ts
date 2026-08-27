// docs/design_doc.md 9.2章「モデレーション」の仮実装。
//
// 本格的な判定ロジック（NGワード辞書の運用、伏字回避の正規化、個人情報検出、
// マサカリ表現の文脈判定など）はai/moderation_rules.pyにPython側で実装済みだが、
// ai/app.pyのHTTP APIからはまだ呼べない（ai側は現在進行形で開発中）。
//
// ここではローカルE2E疎通検証のための最小限のルールベース判定を仮置きする。
// design_doc.md 7章のPOST /api/ai/transformが要求する
// { action: allow | rewrite_required | block, reasonCodes } の形は満たす。

const BLOCK_WORDS = [
  "死ね",
  "しね",
  "殺す",
  "ころす",
  "消えろ",
  "きえろ",
];

const REWRITE_WORDS = [
  "無能",
  "役立たず",
];

export type ModerationAction = "allow" | "rewrite_required" | "block";

export interface ModerationVerdict {
  action: ModerationAction;
  reasonCodes: string[];
}

export function checkModeration(text: string): ModerationVerdict {
  const hasBlockWord = BLOCK_WORDS.some((w) => text.includes(w));
  if (hasBlockWord) {
    return { action: "block", reasonCodes: ["ng_word"] };
  }

  const hasRewriteWord = REWRITE_WORDS.some((w) => text.includes(w));
  if (hasRewriteWord) {
    return { action: "rewrite_required", reasonCodes: ["harsh_criticism"] };
  }

  return { action: "allow", reasonCodes: [] };
}
