import type { PersonaKind, ReactionTargetKind, ReactionType } from "./types";

/*
 * 対象別リアクションの唯一の定義（docs/specification.md §9.1、FR-REACT-001〜009）。
 *
 * 画面ごとにボタンを並べ直さない。リアクション行は対象の種類だけを受け取り、
 * この表からボタンを引く。ここを直せば全画面が同時に変わる。
 */

export const REACTIONS_BY_TARGET: Readonly<Record<ReactionTargetKind, readonly ReactionType[]>> = {
  bubble: ["ogya", "yoshiyoshi", "wakaruwa"],
  babySoothe: ["ogya", "yoshiyoshi", "wakaruwa"],
  // FR-REACT-005：ばぶー の1種のみ。3種は選択肢に現れない
  motherSoothe: ["babu"],
};

/**
 * 表示ラベル。
 * `wakaruwa` のラベルは「わかるわぁ」で、哺乳瓶はそのアイコン。
 * 「哺乳瓶」という別のリアクションを作らない（FR-REACT-009）。
 */
export const REACTION_LABEL: Readonly<Record<ReactionType, string>> = {
  ogya: "おぎゃー",
  yoshiyoshi: "よしよし",
  wakaruwa: "わかるわぁ",
  babu: "ばぶー",
};

/** あやすの発信ペルソナから、そのあやすに使えるリアクションの対象種別を決める */
export function reactionTargetOfSoothe(authorKind: PersonaKind): ReactionTargetKind {
  return authorKind === "mother" ? "motherSoothe" : "babySoothe";
}

/**
 * 許可されている組み合わせかどうか。
 * 画面から隠すだけでは不可（FR-REACT-007）。フロントは「そもそも出さない」を担保する側で、
 * 保存を止めるのはサーバ側。ここはその二重化のフロント分。
 */
export function isReactionAllowed(target: ReactionTargetKind, type: ReactionType): boolean {
  return REACTIONS_BY_TARGET[target].includes(type);
}
