// docs/design_doc.md 6章「データ設計（Deno KV）」に対応する型定義。
// 値のスキーマは実装フェーズで柔軟に調整可能（アジャイル前提）。

export interface Account {
  id: string;
  createdAt: string;
}

export interface BabyPersona {
  id: string;
  accountId: string; // 内部専用。他ユーザーへは返さない
  nickname: string;
  bio?: string;
  createdAt: string;
}

export interface MotherPersona {
  id: string;
  accountId: string; // 内部専用。他ユーザーへは返さない
  nickname: string;
  bio?: string;
  createdAt: string;
}

export interface StampRef {
  stampId: string;
  position?: number;
}

export interface Post {
  id: string;
  babyPersonaId: string;
  body: string;
  stamps: StampRef[];
  tags: string[];
  mood?: string;
  createdAt: string;
}

export interface Stamp {
  id: string;
  name: string;
  imageUrl: string;
  createdAt: string;
}

export type PersonaType = "baby" | "mother";

export interface Comment {
  id: string;
  personaType: PersonaType;
  personaId: string;
  body: string;
  createdAt: string;
}

export type ReactionType = "ogya" | "babu" | "yoshiyoshi";

export interface Reaction {
  reactorAccountId: string;
  type: ReactionType;
  createdAt: string;
}

export interface Follow {
  createdAt: string;
}

export interface PersonaAgeEstimate {
  estimatedAge: number;
  sampleCount: number;
  updatedAt: string;
}
