import type { Stamp } from "./types";

/*
 * スタンプのカタログ（GET /api/stamps 相当。FR-STAMP-001）。
 *
 * 中身は public/data/stamps.json から入る（PO の指示、2026-08-26 / Issue #30）。
 * ここは入れ物だけ。絵柄そのものは components/BubbleBody.tsx の StampShape が持つ
 * （見た目は未定。DESIGN.md §11）。
 *
 * 本文には `:id:` の形で埋め込み、表示側で図に置き換える。
 * スタンプは画像の参照なので、本文の文字数では1文字として数える。
 */
export let STAMP_CATALOG: readonly Stamp[] = [];

export function registerStamps(next: readonly Stamp[]): void {
  STAMP_CATALOG = next;
}
