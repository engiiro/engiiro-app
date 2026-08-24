/**
 * バブル本文の上限（FR-POST-002 / NFR-005、DESIGN.md frontmatter layout.bubble-max-length）。
 * 150 は保存され、151 は保存されない。入力は止めず、保存を止める。
 */
export const BUBBLE_MAX_LENGTH = 150;

/** 残りこの文字数からカウンタの色を変える（DESIGN.md §4 文字数カウンタ） */
export const BUBBLE_WARN_REMAINING = 20;

/**
 * 文字数の数え方。
 * サロゲートペアを2文字と数えないよう、コードポイントで数える。
 * 正式な数え方は未確定（docs/design_doc.md §7.1 の注記）。確定したらここだけ直す。
 */
export function countChars(text: string): number {
  return [...text].length;
}

/**
 * 保存できない長さかどうか。
 * 入力は止めず、保存ボタンだけを無効にするための判定（FR-POST-002 / NFR-005）。
 */
export function isOverLimit(text: string): boolean {
  return countChars(text) > BUBBLE_MAX_LENGTH;
}

/** あやす本文の上限は仕様に無いので、上限を作らない（勝手に決めない） */
