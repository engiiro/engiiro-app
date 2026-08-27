import type { Me, PublicPersona, ReactionState } from "./types";

/*
 * モックデータの読み込み（PO の指示、2026-08-26 / Issue #30）。
 *
 * ダミーデータは `public/data/*.json` に置いてある。
 * ここは、それを取りに行くだけの層。
 *
 * ★ なぜ TypeScript の定数ではなく JSON なのか
 *   「この項目は要るのか」「この一覧は使うのか」を、ビルドし直さずに
 *   触って確かめられるようにするため。JSON を書き換えて再読み込みすれば画面が変わる。
 *
 * ★ 実 API へ差し替えるときは、この層ごと消える。
 *   画面は `data/api.ts` しか見ていないので、画面側は触らない。
 *
 * ★ accountId に相当する項目は、どのファイルにも持たせていない（FR-COMMON-005 / FR-PRIV-004）。
 *   本人の2ペルソナが1か所に入るのは profile-me.json だけで、これは
 *   `GET /api/profile/me` にあたる（FR-PERSONA-005）。
 */

const BASE = import.meta.env.BASE_URL + "data/";

export type BubbleSeed = {
  readonly id: string;
  readonly authorPersonaId: string;
  readonly body: string;
  /** 何分前か。絶対時刻は持たない（DESIGN.md §0.1-5） */
  readonly minutesAgo: number;
  readonly reactions: ReactionState;
  /** 閲覧者の赤ちゃんペルソナとの近さ。AI 文章評価の結果の代わり（FR-FEED-003） */
  readonly affinity: number;
};

export type SootheSeed = {
  readonly id: string;
  readonly bubbleId: string;
  readonly authorPersonaId: string;
  readonly body: string;
  readonly minutesAgo: number;
  readonly reactions: ReactionState;
  readonly replyToSootheId?: string;
};

export type MeSeed = Me & { readonly birthday: string };

export type MockSource = {
  readonly personas: readonly PublicPersona[];
  readonly me: MeSeed;
  readonly bubbles: readonly BubbleSeed[];
  readonly soothes: readonly SootheSeed[];
  readonly stamps: readonly { readonly id: string; readonly name: string }[];
  /** 大好きにしているペルソナの id。フォロー**されている**側は持たない（OUT-004） */
  readonly following: readonly string[];
};

async function load<T>(name: string): Promise<T> {
  const response = await fetch(BASE + name);
  if (!response.ok) {
    throw new Error("モックデータを読めませんでした: " + name);
  }
  return (await response.json()) as T;
}

/**
 * 全部まとめて読む。
 * サーバが起動時にデータを持っている状態の代わりなので、1回だけ実行する。
 */
export async function loadMockSource(): Promise<MockSource> {
  const [personas, me, bubbles, soothes, stamps, following] = await Promise.all([
    load<readonly PublicPersona[]>("personas.json"),
    load<MeSeed>("profile-me.json"),
    load<readonly BubbleSeed[]>("bubbles.json"),
    load<readonly SootheSeed[]>("soothes.json"),
    load<readonly { readonly id: string; readonly name: string }[]>("stamps.json"),
    load<readonly string[]>("follows-me.json"),
  ]);
  return { personas, me, bubbles, soothes, stamps, following };
}
