import type { Me, PublicPersona } from "./types";

/*
 * ペルソナの持ち場。
 *
 * 中身は public/data/personas.json と public/data/profile-me.json から入る
 * （PO の指示、2026-08-26 / Issue #30）。このファイルは入れ物だけを持つ。
 *
 * accountId に相当するフィールドは持たない。
 * どのペルソナが同じ人かという情報も、JSON にもここにも書かない
 * （書けば、そのまま非連結違反のデータ構造になる。FR-PERSONA-003）。
 */

/**
 * 閲覧者自身。両ペルソナをまとめて持てるのは本人専用の文脈だけ（FR-PERSONA-005）。
 * 画面では、この2つのニックネームを同時に出さない（DESIGN.md §0.1-1）。
 *
 * 読み込みが終わるまでは空。画面は data/api.ts 経由でしか触らないので、
 * 空のまま表示されることはない。
 */
export let ME: Me = {
  baby: { id: "bp_me", kind: "baby", nickname: "" },
  mother: { id: "mp_me", kind: "mother", nickname: "" },
};

/**
 * 差し替えるのは2か所だけ。
 *   1. モックデータの読み込みが終わったとき
 *   2. 登録（S1）でニックネームが決まったとき
 *
 * 実 API に差し替えるときは、ログイン中のアカウントを保持する仕組みに置き換わる。
 * ペルソナ id は変えない。
 */
export function setMe(next: Me): void {
  ME = next;
  PERSONA_BY_ID[next.baby.id] = next.baby;
  PERSONA_BY_ID[next.mother.id] = next.mother;
}

/**
 * id からペルソナを引く表。**data/api.ts（サーバ側の境界）からだけ使う。**
 *
 * ME.baby と ME.mother が同じ表に並ぶが、これはサーバが内部で持っている状態の代わり。
 * 画面側からこの表を引かない。引けば「id を渡せば誰でも辿れる」形になり、
 * 非連結を守る責任が画面側へこぼれる（FR-PERSONA-003）。
 */
export const PERSONA_BY_ID: Record<string, PublicPersona> = {};

/** 読み込んだ公開ペルソナを表に入れる */
export function registerPersonas(personas: readonly PublicPersona[]): void {
  for (const persona of personas) {
    PERSONA_BY_ID[persona.id] = persona;
  }
}
