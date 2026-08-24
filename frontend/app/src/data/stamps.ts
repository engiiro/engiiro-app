import type { Stamp } from "./types";

/*
 * スタンプのカタログ（GET /api/stamps 相当。FR-STAMP-001）。
 *
 * 見た目は未定（DESIGN.md §11）。ここにあるのは仮の図形で、差し替え前提。
 * 本文には `:id:` の形で埋め込み、表示側（components/BubbleBody.tsx）で図に置き換える。
 * スタンプ自体は画像の参照なので、本文の文字数では1文字として数える。
 */
export const STAMP_CATALOG: readonly Stamp[] = [
  { id: "nemui", name: "ねむい" },
  { id: "ogya", name: "おぎゃー" },
  { id: "bottle", name: "ほにゅうびん" },
  { id: "pacifier", name: "おしゃぶり" },
  { id: "heart", name: "すき" },
  { id: "star", name: "きらきら" },
  { id: "cloud", name: "もやもや" },
  { id: "drop", name: "ぽろり" },
];
