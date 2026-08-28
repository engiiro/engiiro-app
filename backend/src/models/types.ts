// docs/design_doc.md 6章「データ設計（PostgreSQL）」に対応する型定義。
// カラム名(snake_case)とAPIレスポンス(camelCase)を橋渡しする、DB行の型。

export interface AccountRow {
  id: string;
  login_id: string;
  password_hash: string;
  birth_date: string; // YYYY-MM-DD
  created_at: string;
}

export interface BabyPersonaRow {
  id: string;
  account_id: string; // 内部専用。外部レスポンスに含めない（FR-COMMON-005、FR-PERSONA-003）
  nickname: string;
  bio: string | null;
  created_at: string;
}

export interface MotherPersonaRow {
  id: string;
  account_id: string; // 同上
  nickname: string;
  bio: string | null;
  created_at: string;
}

export interface StampRow {
  id: string;
  name: string;
  image_url: string;
  /** スタンプの棚。frontendの一覧タブがこれで分かれる（weak / glad / soothe / reply） */
  shelf: string;
  /** 棚の中の並び。created_atはseedで同値になるため並び順の根拠にできない */
  sort_order: number;
  created_at: string;
}

export interface PostRow {
  id: string;
  baby_persona_id: string;
  body: string;
  deleted_at: string | null;
  created_at: string;
}

export interface PostStampRow {
  id: string;
  post_id: string;
  stamp_id: string;
  position: number | null;
}

export type PersonaType = "baby" | "mother";

export interface CommentRow {
  id: string;
  post_id: string;
  persona_type: PersonaType;
  baby_persona_id: string | null;
  mother_persona_id: string | null;
  reply_to_comment_id: string | null;
  body: string;
  deleted_at: string | null;
  created_at: string;
}

export type ReactionTargetType = "post" | "comment";
export type ReactionType = "ogya" | "yoshiyoshi" | "manma" | "babu";

export interface ReactionRow {
  id: string;
  target_type: ReactionTargetType;
  target_post_id: string | null;
  target_comment_id: string | null;
  reactor_account_id: string;
  type: ReactionType;
  created_at: string;
}

export interface FollowRow {
  id: string;
  follower_account_id: string;
  target_persona_type: PersonaType;
  target_persona_id: string;
  created_at: string;
}

export interface PersonaAgeEstimateRow {
  persona_type: PersonaType;
  persona_id: string;
  estimated_age: string | null; // numeric型はpgがstringで返す
  sample_count: number;
  updated_at: string;
}
