import { STAMP_CATALOG } from "./stampCatalog";

/**
 * 同じ人が1種類のリアクションを押せる回数の上限（人間の決定、2026-08-25）。
 * 上限に達したら、そのボタンは押せなくなる。取り消しは今のところ用意していない。
 */
export const REACTION_MAX_PER_USER = 5;

/**
 * バブル本文の上限（FR-POST-002 / NFR-005、DESIGN.md frontmatter layout.bubble-max-length）。
 * 150 は保存され、151 は保存されない。入力は止めず、保存を止める。
 */
export const BUBBLE_MAX_LENGTH = 150;

/** 残りこの文字数からカウンタの色を変える（DESIGN.md §4 文字数カウンタ） */
export const BUBBLE_WARN_REMAINING = 20;

/** 本文に埋め込むスタンプの目印。`:nemui:` のような形 */
export const STAMP_MARKER = /:([a-z0-9_]+):/g;

/**
 * 文字数の数え方。
 * サロゲートペアを2文字と数えないよう、コードポイントで数える。
 * 正式な数え方は未確定（docs/design_doc.md §7.1 の注記）。確定したらここだけ直す。
 */
export function countChars(text: string): number {
  /*
   * スタンプの目印（:stampId:）は、画像1つぶん＝1文字として数える。
   * カタログに無い id はただの文字列なので置き換えない（components/BubbleBody.tsx の
   * isKnownStamp と同じ判定。ここを素通しすると "12:34:56" のような時刻表記まで
   * スタンプ扱いされ、実際より少なく数えてしまう）。
   */
  const collapsed = text.replace(STAMP_MARKER, (marker, id: string) =>
    STAMP_CATALOG.some((stamp) => stamp.id === id) ? " " : marker,
  );
  return [...collapsed].length;
}

/**
 * 本文にカタログのスタンプが1つでも入っているか。
 *
 * 入力欄（textarea）の中に画像は出せないので、入っているときだけ
 * 「こう出ます」の見え方を別に出す（screens/ComposePanel.tsx）。
 */
export function containsStamp(text: string): boolean {
  for (const match of text.matchAll(STAMP_MARKER)) {
    if (STAMP_CATALOG.some((stamp) => stamp.id === match[1])) {
      return true;
    }
  }
  return false;
}

/**
 * 保存できない長さかどうか。
 * 入力は止めず、保存ボタンだけを無効にするための判定（FR-POST-002 / NFR-005）。
 */
export function isOverLimit(text: string): boolean {
  return countChars(text) > BUBBLE_MAX_LENGTH;
}

/** あやす本文の上限は仕様に無いので、上限を作らない（勝手に決めない） */
