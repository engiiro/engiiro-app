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
  /** タイムラインの優先表示の材料（FR-FEED-003）。新着順のみにしないため */
  readonly affinity: number;
  /**
   * このバブルに直接ついたあやすの件数。
   * あやすへの返信は数に入れない。そちらは Soothe.replyCount が持つ。
   */
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
  /**
   * このあやすに直接ついたあやすの件数（人間の指示、2026-08-26）。
   *
   * 件数だけで、誰が返したかは持たない。一覧を開けば発信ペルソナは見えるが、
   * それは開いた1画面のなかの話で、件数の側に人を持たせない。
   */
  readonly replyCount: number;
};

/**
 * バブル1件と、それに直接ついたあやす。
 *
 * ★ `soothes` に入るのは replyToSootheId を持たないものだけ。
 *   あやすへの返信は、そのあやすの詳細（SootheDetail）側に入る。
 *   混ぜて平らに並べると、何件ついているのかも、誰への返事なのかも読めない。
 */
export type BubbleDetail = {
  readonly bubble: Bubble;
  readonly soothes: readonly Soothe[];
};

/**
 * あやす1件と、それに直接ついたあやす（人間の指示、2026-08-26）。
 *
 * バブル詳細と同じ形にそろえてある。あやすもタッチで開けて、
 * その先で「誰があやしているか」を一覧で見られる。
 *
 * ★ 持たせていないもの：
 *   - 元のバブルの発信者。文脈を思い出すための抜粋だけを渡す。
 *     あやすの発信者と バブルの発信者を、この画面の主役として並べない
 *     （バブル詳細では並ぶが、あちらはバブルが主役の画面）
 *   - 親をさかのぼる連鎖。1階層ずつ開く。ここに祖先を全部積むと、
 *     ひとつの応答に関係者が芋づるで並ぶ
 */
export type SootheDetail = {
  readonly soothe: Soothe;
  /** 元のバブル。「もとの バブルへ」で戻るために id だけ持つ */
  readonly bubbleId: string;
  /** 元のバブル本文の抜粋。本文そのものではない */
  readonly bubbleExcerpt: string;
  /**
   * 元のバブルが閲覧者自身のものか。
   * 返信に使えるペルソナの判定に要る（soothePersonaRule）。識別子ではない。
   */
  readonly bubbleIsMine: boolean;
  /** このあやす自体が返信のとき、その相手のニックネーム */
  readonly replyToNickname?: string;
  /** このあやすに直接ついたあやす */
  readonly replies: readonly Soothe[];
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

/*
 * スタンプを置く棚（人間の指示 2026-08-27。絵柄の確定に合わせて改訂 2026-08-28）。
 *
 *   weak   … 弱音を出す（ないちゃう・あくび・ほしい）
 *   glad   … うれしい（ばんざい・にこにこ・すき）
 *   soothe … あやす側（わかる・がんばれ・ありがとう）
 *   reply  … かるい返事（りょうかい・びっくり・ごめんね）
 *
 * ★ 素材フォルダ（frontend/images/stamps/<気持ち>/）の名前とは一致しない。
 *   あちらは絵の分類、こちらは選ぶときの並び。
 *   どの絵をどの id に割り当てたかは frontend/app/README.md の表にある。
 */
export type StampShelf = "weak" | "glad" | "soothe" | "reply";

/** バブル本文に挿入できるスタンプ（FR-POST-005 / FR-STAMP-001） */
export type Stamp = {
  readonly id: string;
  readonly name: string;
  /**
   * 絵柄の場所。設計書 §7 の `GET /api/stamps` の応答にある `imageUrl` と同じ項目。
   * モックでは public/images/stamps/<id>.png（透過 PNG、128px）を指す。
   */
  readonly imageUrl: string;
  /*
   * どの棚に置くか。一覧を分けるために使う。
   *
   * ★ GET /api/stamps の応答に足してもらった項目（2026-08-28）。設計書 §7 の
   *   表にはまだ無い。無い応答（古い backend）が来たときは data/api.ts の
   *   toShelf が「へんじ」に寄せるので、棚が潰れるだけで絵は出る。
   */
  readonly shelf: StampShelf;
};

/**
 * ニックネームの変更（人間の指示、2026-08-28）。
 *
 * ★ 変えられるのは自分のペルソナだけ。どのペルソナを変えるかを id で指定しない。
 *   サーバはトークンから持ち主を引いて、その赤ちゃん／お母さんだけを更新する。
 * ★ 片方だけ送れる。送らなかった側は変わらない（FR-PERSONA-002）。
 */
export type UpdateNicknamesInput = {
  readonly baby?: string;
  readonly mother?: string;
};

export type UpdateNicknamesResult =
  | { readonly ok: true; readonly me: Me }
  | {
      readonly ok: false;
      readonly reason:
        | "empty"
        | "too_long"
        | "charset"
        /** 赤ちゃんとお母さんが同じ名前になる（FR-PERSONA-003） */
        | "same"
        /** ログインしていない／期限切れ */
        | "unauthorized"
        /** 通信や保存の失敗。もう一度やり直せる */
        | "failed";
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
 * プロフィールの一覧の切り替え（人間の指示、2026-08-25 のモック）。
 * S8（自分）と S6（他人）で同じものを使う。
 *
 *   babyBubbles    … 赤ちゃんとして書いたバブルだけ
 *   babyAll        … 赤ちゃんとしてのバブルとあやすの両方
 *   motherSoothes  … お母さんとしてのあやすだけ
 *
 * ★ どれも「1つのペルソナの行動」しか含まない。
 *   赤ちゃんの一覧にお母さんとしてのあやすを混ぜると、その時点で
 *   2つのペルソナが同じ人のものだと分かってしまう（FR-PERSONA-003）。
 */
export type ActivityTab = "babyBubbles" | "babyAll" | "motherSoothes";

/** 一覧に並ぶ1件。バブルとあやすが混ざるので種別を持つ */
export type ActivityEntry =
  | { readonly kind: "bubble"; readonly bubble: Bubble }
  | {
      readonly kind: "soothe";
      readonly soothe: Soothe;
      /** どのバブルへのあやすかを思い出すための短い抜粋。本文そのものではない */
      readonly toBubbleExcerpt: string;
    };

/**
 * 他人から見える公開プロフィール（S6 / FR-PROFILE-005）。
 *
 * ★ 持たせていないものが、この型の本体：
 *   - もう一方のペルソナ、およびそこへ到達できる手がかり（FR-PERSONA-004）
 *   - 生年月日。両ペルソナは同時に作られるので、公開すると突き合わせで
 *     同一人物が割れる（FR-PRIV-004。人間の指示でも非表示）
 *   - フォロー中の数と中身（人間の指示。FR-FOLLOW-003 は本人だけが参照できる要件）
 *   - フォロワー数・フォロワー一覧（FR-FOLLOW-004/005、OUT-004）
 *
 * 推定年齢は1ペルソナぶんだけ持つ。まとめて見せないかぎり FR-PERSONA-005 に触れない。
 */
export type PublicProfile = {
  readonly persona: PublicPersona;
  /** そのペルソナ単独の推定。使えないときは null（NFR-002） */
  readonly status: PersonaStatus | null;
  /** 閲覧者がこのペルソナを「大好き」にしているか（FR-FOLLOW-001/002） */
  readonly liked: boolean;
  /** 自分自身のペルソナか。大好きボタンを出すかどうかだけに使う */
  readonly isMe: boolean;
};

/**
 * アカウント登録の入力（S1 / FR-ACCOUNT-001/002）。
 *
 * 1回の登録で赤ちゃんとお母さんの2ペルソナが同時にできる（FR-ACCOUNT-001）。
 * ニックネームは別々に決める（FR-ACCOUNT-002）。
 *
 * ★ 認証情報はアカウントに紐づく内部情報。応答にも他の型にも持ち出さない（FR-ACCOUNT-003）。
 *   この型は「送るもの」で、返ってくるものには password を含めない。
 */
export type CreateAccountInput = {
  readonly accountId: string;
  readonly password: string;
  /**
   * 生年月日（ISO8601 の日付 "YYYY-MM-DD"）。
   *
   * ★ アカウントに紐づく本人の情報で、**公開側には一切渡らない**。
   *   MyProfile だけが持ち（S8 でしか出さない）、PublicPersona / PublicProfile の
   *   型にはこの項目そのものを置かない（FR-PRIV-004）。
   *   AI にも渡さない（FR-AI-003 / FR-PRIV-003）。
   */
  readonly birthday: string;
  readonly babyNickname: string;
  readonly motherNickname: string;
};

/**
 * 登録の結果。
 *
 * 失敗の理由は、画面の出し分けに使う粗い区分だけ。
 * どの規則に当たったかの内部情報は返さない（FR-MOD-034 / FR-PRIV-006 と同じ立場）。
 */
export type CreateAccountResult =
  | { readonly ok: true; readonly me: Me }
  | {
      readonly ok: false;
      readonly reason:
        | "account_id_taken"
        | "account_id_invalid"
        | "password_weak"
        | "birthday_invalid"
        | "nickname_empty"
        | "nickname_too_long"
        | "nickname_same"
        | "nickname_moderation";
    };
