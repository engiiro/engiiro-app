import type { Me, PublicPersona } from "./types";

/*
 * 静的ダミーのペルソナ。
 *
 * accountId に相当するフィールドは持たない。
 * どのペルソナが同じ人かという情報も、このファイルのどこにも書かない
 * （書けば、そのまま非連結違反のデータ構造になる。FR-PERSONA-003）。
 */

export const BABY_PERSONAS: Readonly<Record<string, PublicPersona>> = {
  sheep: { id: "bp_sheep", kind: "baby", nickname: "ねむれないひつじ" },
  taputapu: { id: "bp_taputapu", kind: "baby", nickname: "たぷたぷ2さい" },
  babubabu: { id: "bp_babubabu", kind: "baby", nickname: "ばぶばぶ実装中" },
  mikan: { id: "bp_mikan", kind: "baby", nickname: "みかんぼうや" },
  yowane: { id: "bp_yowane", kind: "baby", nickname: "よわねちゃん" },
  puni: { id: "bp_puni", kind: "baby", nickname: "ぷにぷに" },
};

export const MOTHER_PERSONAS: Readonly<Record<string, PublicPersona>> = {
  okan: { id: "mp_okan", kind: "mother", nickname: "おかん3ごう" },
  manmaru: { id: "mp_manmaru", kind: "mother", nickname: "まんまるかあさん" },
  yoshiyoshi: { id: "mp_yoshiyoshi", kind: "mother", nickname: "よしよし係" },
};

/**
 * 閲覧者自身。両ペルソナをまとめて持てるのは本人専用の文脈だけ（FR-PERSONA-005）。
 * 画面では、この2つのニックネームを同時に出さない（DESIGN.md §0.1-1）。
 */
export const ME: Me = {
  baby: { id: "bp_me", kind: "baby", nickname: "よわねだいおう" },
  mother: { id: "mp_me", kind: "mother", nickname: "そっとみまもり係" },
};

/**
 * id からペルソナを引く表。**data/api.ts（サーバ側の境界）からだけ使う。**
 *
 * ME.baby と ME.mother が同じ表に並ぶが、これはサーバが内部で持っている状態の代わり。
 * 画面側からこの表を引かない。引けば「id を渡せば誰でも辿れる」形になり、
 * 非連結を守る責任が画面側へこぼれる（FR-PERSONA-003）。
 */
export const PERSONA_BY_ID: Readonly<Record<string, PublicPersona>> = Object.fromEntries(
  [...Object.values(BABY_PERSONAS), ...Object.values(MOTHER_PERSONAS), ME.baby, ME.mother].map(
    (persona) => [persona.id, persona],
  ),
);
