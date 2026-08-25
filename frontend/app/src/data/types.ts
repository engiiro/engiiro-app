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
 * リアクションの種類。
 * `manma`（旧称「わかるわぁ」「哺乳瓶」）は1つのリアクション（FR-REACT-009）。
 * `babu` はお母さんとしてのあやす専用（FR-REACT-005）。
 */
export type ReactionType = "ogya" | "yoshiyoshi" | "manma" | "babu";

/** リアクションの対象。何を出せるかはこの種類だけで決まる（FR-REACT-003〜006） */
export type ReactionTargetKind = "bubble" | "babySoothe" | "motherSoothe";

/**
 * リアクションの状態。
 *
 * リアクションにペルソナの要素は無い（人間の決定、2026-08-24）。
 * 誰が押したかも持たない。持てば、それ自体が非連結を崩す材料になる。
 *
 * 1種類につき同じ人が 5 回まで押せる（人間の決定、2026-08-25）。
 * `mine` は「押したかどうか」ではなく「何回押したか（0〜5）」。
 */
export type ReactionState = {
  /** 全員ぶんの合計 */
  readonly counts: Readonly<Partial<Record<ReactionType, number>>>;
  /** 閲覧者自身が押した回数（0〜REACTION_MAX_PER_USER） */
  readonly mine: Readonly<Partial<Record<ReactionType, number>>>;
};

/** バブル＝赤ちゃんペルソナとして投稿する本文。お母さんでは投稿できない（FR-POST-003） */
export type Bubble = {
  readonly id: string;
  readonly author: PublicPersona;
  readonly body: string;
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
  /** リアクションを出すかの判定だけに使う。識別子ではない */
  readonly isMine: boolean;
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

/** バブル本文に挿入できるスタンプ（FR-POST-005 / FR-STAMP-001） */
export type Stamp = {
  readonly id: string;
  readonly name: string;
};

export type CreateBubbleInput = {
  readonly body: string;
};

export type CreateSootheInput = {
  readonly bubbleId: string;
  readonly personaKind: PersonaKind;
  readonly body: string;
  readonly replyToSootheId?: string;
};

/**
 * ペルソナのステータス（赤ちゃん度・お母さん度。FR-PROFILE-001/002）。
 * AI 文章評価の結果をまとめたもので、赤ちゃんとお母さんでは軸の意味が違う
 * （FR-AI-EVAL-002）。同じ尺度の値として並べて比べない。
 */
export type PersonaStatus = {
  /** 何か月相当か */
  readonly months: number;
  /** 画面に出す文字。バーだけで伝えないため（DESIGN.md §4 Meter） */
  readonly label: string;
  /** 軸の名前。赤ちゃんとお母さんで意味が違うことを画面でも示す */
  readonly axis: string;
  /** 算出のもとにした本文の件数。0 のときはまだ材料が無い */
  readonly sampleCount: number;
};

/** 本人専用プロフィール（S8）の1ペルソナぶん */
export type MyProfileEntry = {
  readonly persona: PublicPersona;
  readonly bio?: string;
  /**
   * AI 文章評価が使えないときは null（NFR-002）。
   * ここが null でも他の機能は止めない。プロフィールは読めるままにする。
   */
  readonly status: PersonaStatus | null;
};

/**
 * 本人専用プロフィール（S8 / GET /api/profile/me 相当）。
 *
 * 両ペルソナのステータスをまとめて持てるのはここだけ（FR-PERSONA-005）。
 * この型を公開系の画面・応答で使わない。
 */
export type MyProfile = {
  readonly baby: MyProfileEntry;
  readonly mother: MyProfileEntry;
  /**
   * 生年月日（ISO8601 の日付）。**S8 でしか出さない。**
   *
   * 仕様書に項目が無い（人間の指示、2026-08-25 のモック）。
   * 公開プロフィールに出すと、両ペルソナを突き合わせる材料になるので、
   * S6（他人の公開プロフィール）側の型には、この項目そのものを持たせない（FR-PRIV-004）。
   */
  readonly birthday: string;
  /**
   * フォロー「中」の数。本人だけが見られる（FR-FOLLOW-003）。
   * フォロー「されている」数ではない。そちらは誰にも出さない（FR-FOLLOW-004/005、OUT-004）。
   */
  readonly followingBabyCount: number;
  readonly followingMotherCount: number;
};

/**
 * S8 の一覧の切り替え（人間の指示、2026-08-25 のモック）。
 *
 *   babyBubbles    … 赤ちゃんとして書いたバブルだけ
 *   babyAll        … 赤ちゃんとしてのバブルとあやすの両方
 *   motherSoothes  … お母さんとしてのあやすだけ
 *
 * この3つは本人の行動しか含まない。他人の行動が混ざる口にしない。
 */
export type MyActivityTab = "babyBubbles" | "babyAll" | "motherSoothes";

/** S8 の一覧に並ぶ1件。バブルとあやすが混ざるので種別を持つ */
export type MyActivityItem =
  | { readonly kind: "bubble"; readonly bubble: Bubble }
  | {
      readonly kind: "soothe";
      readonly soothe: Soothe;
      /** どのバブルへのあやすかを思い出すための短い抜粋。本文そのものではない */
      readonly toBubbleExcerpt: string;
    };
