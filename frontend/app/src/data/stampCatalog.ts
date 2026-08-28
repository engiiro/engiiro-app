import type { Stamp, StampShelf } from "./types";

/*
 * スタンプのカタログ（GET /api/stamps 相当。FR-STAMP-001）。
 *
 * 中身は GET /api/stamps から入る（data/api.ts の fetchStamps が registerStamps を呼ぶ）。
 * ここは入れ物だけ。絵柄は public/images/stamps/<id>.png（透過 PNG）で、
 * 本文中の表示は components/BubbleBody.tsx の StampGlyph が出す。
 *
 * 本文には `:id:` の形で埋め込み、表示側で絵に置き換える。
 * スタンプは画像の参照なので、本文の文字数では1文字として数える。
 */
export let STAMP_CATALOG: readonly Stamp[] = [];

export function registerStamps(next: readonly Stamp[]): void {
  STAMP_CATALOG = next;
}

/*
 * 棚（人間の指示 2026-08-27。絵柄の確定に合わせて改訂 2026-08-28）。
 *
 * ★ 並び順とラベルはここが正本。画面側で並べ直さない。
 * ★ 分け方は「気持ち」よりも「いま何をしているか」に寄せてある。
 *   このサービスは弱音を出す側（バブル）と受け止める側（あやす）の2つで動くので、
 *   棚もその2つが先に来る。
 */
export const STAMP_SHELVES: readonly {
  readonly key: StampShelf;
  readonly label: string;
}[] = [
  { key: "weak", label: "よわね" },
  { key: "glad", label: "うれしい" },
  { key: "soothe", label: "よしよし" },
  { key: "reply", label: "へんじ" },
];

export type StampGroup = {
  readonly key: string;
  readonly label: string;
  readonly stamps: readonly Stamp[];
};

/** 表に無い棚を集めるキー。この中でだけ使う */
const STAMP_GROUP_FALLBACK = "other";

/**
 * カタログを棚ごとに分ける。
 *
 * ★ 空の棚は出さない。カタログに無い棚のタブを押させない。
 * ★ 表に無い棚が付いていたスタンプは「そのほか」にまとめる。
 *   分類の取りこぼしでスタンプが画面から消えるほうが、棚が1つ増えるより悪い。
 */
export function stampGroups(catalog: readonly Stamp[] = STAMP_CATALOG): readonly StampGroup[] {
  const known = new Set<string>(STAMP_SHELVES.map((shelf) => shelf.key));

  const groups: StampGroup[] = [];
  for (const shelf of STAMP_SHELVES) {
    const stamps = catalog.filter((stamp) => stamp.shelf === shelf.key);
    if (stamps.length > 0) {
      groups.push({ key: shelf.key, label: shelf.label, stamps });
    }
  }

  const rest = catalog.filter((stamp) => !known.has(stamp.shelf));
  if (rest.length > 0) {
    groups.push({ key: STAMP_GROUP_FALLBACK, label: "そのほか", stamps: rest });
  }

  return groups;
}
