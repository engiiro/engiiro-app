/*
 * 画面が使うドメイン型。
 *
 * 正本は docs/specification.md §3.1（用語）と docs/design_doc.md §6/§7。
 * accountId に相当するフィールドは一切持たせない（FR-COMMON-005 / FR-PRIV-004）。
 * 「誰がフォローしているか」「フォロワー数」に相当する型も作らない（OUT-004）。
 */

/** 行動のたびに選ぶモード。固定の属性ではない（docs/specification.md §3.2） */
export type PersonaKind = "baby" | "mother";

/** 外から見えるペルソナ。ここに accountId は無い */
export type PublicPersona = {
  readonly id: string;
  readonly kind: PersonaKind;
  readonly nickname: string;
};

/**
 * リアクションの種類。`wakaruwa` の別名が「哺乳瓶」で、2種類ではない（FR-REACT-009）。
 * `babu` はお母さんとしてのあやす専用（FR-REACT-005）。
 */
export type ReactionType = "ogya" | "yoshiyoshi" | "wakaruwa" | "babu";

/** リアクションの対象。何を出せるかはこの種類だけで決まる（FR-REACT-003〜006） */
export type ReactionTargetKind = "bubble" | "babySoothe" | "motherSoothe";

export type ReactionState = {
  readonly counts: Readonly<Partial<Record<ReactionType, number>>>;
  /** 閲覧者自身が押したもの。誰が押したかは持たない */
  readonly mine: readonly ReactionType[];
};

/** バブル＝赤ちゃんペルソナとして投稿する本文。お母さんでは投稿できない（FR-POST-003） */
export type Bubble = {
  readonly id: string;
  readonly author: PublicPersona;
  readonly body: string;
  readonly tags: readonly string[];
  /** ISO8601。画面では常に相対表示にする（DESIGN.md §0.1-5） */
  readonly createdAt: string;
  readonly reactions: ReactionState;
  /** 削除を出すかの判定だけに使う（FR-POST-006/007）。識別子ではない */
  readonly isMine: boolean;
  readonly read: boolean;
  /** タイムラインの優先表示の材料（FR-FEED-003）。新着順のみにしないため */
  readonly affinity: number;
  readonly sootheCount: number;
};

/** あやす＝他者のバブルへのコメント。赤ちゃん／お母さんを選んで行う */
export type Soothe = {
  readonly id: string;
  readonly bubbleId: string;
  readonly author: PublicPersona;
  readonly body: string;
  readonly createdAt: string;
  readonly reactions: ReactionState;
  /** あやすへの返信のとき、その相手。返信できるペルソナの判定に使う（FR-COMMENT-005） */
  readonly replyToSootheId?: string;
};

export type BubbleDetail = {
  readonly bubble: Bubble;
  readonly soothes: readonly Soothe[];
};

/**
 * 本人専用の情報（S8 / GET /api/profile/me 相当）。
 * 両ペルソナをまとめて持てるのはここだけ（FR-PERSONA-005）。
 * 画面に両方のニックネームを同時に出さないのは UI 側の責務（DESIGN.md §0.1-1）。
 */
export type Me = {
  readonly baby: PublicPersona;
  readonly mother: PublicPersona;
};

export type CreateBubbleInput = {
  readonly body: string;
  readonly tags: readonly string[];
};

export type CreateSootheInput = {
  readonly bubbleId: string;
  readonly personaKind: PersonaKind;
  readonly body: string;
  readonly replyToSootheId?: string;
};
