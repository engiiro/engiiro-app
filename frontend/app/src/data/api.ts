import { api, ApiError, getToken, setToken } from "./apiClient";
import { BUBBLE_MAX_LENGTH, countChars } from "./constants";
import { ME, PERSONA_BY_ID, registerPersonas, setMe } from "./personas";
import { registerStamps, STAMP_CATALOG } from "./stampCatalog";
import { isReactionAllowed } from "./reactions";
import type {
  Bubble,
  BubbleDetail,
  CreateBubbleInput,
  CreateSootheInput,
  ActivityEntry,
  ActivityTab,
  CreateAccountInput,
  CreateAccountResult,
  Me,
  MyProfile,
  PersonaKind,
  PersonaStatus,
  PublicPersona,
  PublicProfile,
  ReactionState,
  ReactionTargetKind,
  ReactionType,
  Soothe,
  Stamp,
} from "./types";

/*
 * ★ サーバとの境界はこのファイルだけ。
 *
 * ここから下は backend（docs/design_doc.md §7）への実 fetch 呼び出し。
 * 画面側（screens/・components/）のシグネチャは変えていない。
 *
 *   createAccount       → POST   /api/accounts
 *   login / logout      → POST   /api/sessions / DELETE /api/sessions
 *   fetchMe             → GET    /api/profile/me（ログイン中のみ。ゲストはローカルの空値）
 *   fetchMyProfile      → GET    /api/profile/me（S8。両ペルソナのステータス付き）
 *   fetchPublicProfile  → GET    /api/personas/baby/:id / mother/:id
 *   fetchFeed           → GET    /api/posts/feed（＋各投稿を GET /api/posts/:id で解決）
 *   fetchBubbleDetail   → GET    /api/posts/:id ＋ GET /api/posts/:id/comments
 *   createBubble        → POST   /api/posts
 *   createSoothe        → POST   /api/posts/:id/comments
 *   addReaction         → POST   /api/posts/:id/reactions or /api/comments/:id/reactions
 *   deleteBubble        → DELETE /api/posts/:id
 *   fetchStamps         → GET    /api/stamps
 *   fetchLikedPersonas  → GET    /api/follows/me（本人だけが引ける）
 *   setLiked            → POST /api/follows・DELETE /api/follows
 *   evaluateText        → POST   /api/ai/evaluate（ComposePanel の「はかる」用に新設）
 *   transformText        → POST   /api/ai/transform（ComposePanel の「変換」用に新設）
 *
 * ★ design_doc.md 7章に無く、backend側で実装フェーズの補完として追加した口：
 *   DELETE /api/follows（フォロー解除）
 *   GET /api/posts/:id/comments のレスポンスに reactionCounts を追加
 *   POST /api/posts, /api/posts/:id/comments のエラーレスポンスに reason を追加
 *
 * ★ design_doc.md にまだ無いもの（元コメントのまま。今回のローカルE2E統合でも未対応）：
 *   fetchMyActivity/fetchPublicActivity は GET /api/personas/{kind}/:id の
 *   postIds/commentIds から個々の詳細を都度取得して組み立てている（N+1、E2E確認用の簡易実装）。
 */

/** AI処理（評価・変換いずれも）が利用できない場合に投げる（NFR-001〜002）。 */
export class AiUnavailableError extends Error {
  constructor() {
    super("ai unavailable");
    this.name = "AiUnavailableError";
  }
}

/*
 * 閲覧者がログインしているかどうか。isMine の計算とゲストのAPI呼び出し制御に使う。
 * 実体はトークンの有無。setSessionGuest はApp.tsxの画面遷移に合わせて呼ばれる薄い同期。
 */
let viewerIsGuest = getToken() === null;

export function setSessionGuest(guest: boolean): void {
  viewerIsGuest = guest;
}

/** モック時代の互換シム。実APIではAI評価はサーバの生死そのもので決まるため何もしない。 */
export function setAiEvaluateAvailability(_available: boolean): void {
  // no-op: 実APIでは/api/ai/evaluateが503を返すかどうかで自然に決まる
}

function isMinePersonaId(id: string): boolean {
  return !viewerIsGuest && (id === ME.baby.id || id === ME.mother.id);
}

/** 開いたことのあるバブルのid。既読はサーバに送らないローカルのみの状態。 */
const readIds = new Set<string>();

export function markRead(bubbleId: string): void {
  readIds.add(bubbleId);
}

/*
 * 自分が押したリアクションの回数（bubbleId/sootheId → type別回数）。
 *
 * design_doc.mdのGET /api/posts/:id・GET /api/posts/:id/commentsは「自分が何回押したか」
 * (mine)を返さない。addReaction/removeReaction呼び出し直後に返る値だけがmineの情報源なので、
 * ここに憶えておいて一覧・詳細の再取得時にかぶせる。ページを再読み込みすると失われる
 * （E2E疎通確認の簡易実装として許容する制約）。
 */
const myReactionCache = new Map<string, Partial<Record<ReactionType, number>>>();

function withMyReactions(targetId: string, state: ReactionState): ReactionState {
  const mine = myReactionCache.get(targetId);
  return mine ? { ...state, mine } : state;
}

/** ペルソナをid解決する。キャッシュに無ければ公開プロフィールAPIを叩く。 */
async function resolvePersona(kind: PersonaKind, id: string): Promise<PublicPersona> {
  const cached = PERSONA_BY_ID[id];
  if (cached) {
    return cached;
  }
  const path = kind === "baby" ? `/api/personas/baby/${id}` : `/api/personas/mother/${id}`;
  const data = await api.get<{ id: string; nickname: string; bio: string | null }>(path);
  const persona: PublicPersona = { id: data.id, kind, nickname: data.nickname };
  registerPersonas([persona]);
  return persona;
}

type PostDetailResponse = {
  readonly id: string;
  readonly babyPersonaId: string;
  readonly body: string;
  readonly stamps: readonly { readonly stampId: string; readonly position: number | null }[];
  readonly reactionCounts: { readonly ogya: number; readonly yoshiyoshi: number; readonly manma: number };
  readonly createdAt: string;
};

type CommentResponse = {
  readonly id: string;
  readonly personaType: PersonaKind;
  readonly personaId: string;
  readonly body: string;
  readonly replyToCommentId?: string;
  readonly createdAt: string;
  readonly reactionCounts?: Readonly<Record<string, number>>;
};

function toReactionCounts(
  raw: Readonly<Record<string, number>> | undefined,
): Partial<Record<ReactionType, number>> {
  const counts: Partial<Record<ReactionType, number>> = {};
  if (!raw) {
    return counts;
  }
  for (const [key, value] of Object.entries(raw)) {
    if (value > 0) {
      counts[key as ReactionType] = value;
    }
  }
  return counts;
}

async function toBubble(post: PostDetailResponse, sootheCount: number): Promise<Bubble> {
  const author = await resolvePersona("baby", post.babyPersonaId);
  return {
    id: post.id,
    author,
    body: post.body,
    createdAt: post.createdAt,
    reactions: withMyReactions(post.id, { counts: toReactionCounts(post.reactionCounts), mine: {} }),
    isMine: isMinePersonaId(author.id),
    read: readIds.has(post.id),
    affinity: 0,
    sootheCount,
  };
}

async function toSoothe(bubbleId: string, comment: CommentResponse): Promise<Soothe> {
  const author = await resolvePersona(comment.personaType, comment.personaId);
  return {
    id: comment.id,
    bubbleId,
    author,
    body: comment.body,
    createdAt: comment.createdAt,
    reactions: withMyReactions(comment.id, {
      counts: toReactionCounts(comment.reactionCounts),
      mine: {},
    }),
    isMine: isMinePersonaId(author.id),
    replyToSootheId: comment.replyToCommentId,
  };
}

async function fetchCommentsOf(bubbleId: string): Promise<readonly CommentResponse[]> {
  const res = await api.get<{ comments: readonly CommentResponse[] }>(
    `/api/posts/${bubbleId}/comments`,
  );
  return res.comments;
}

async function fetchPostDetail(postId: string): Promise<PostDetailResponse> {
  return api.get<PostDetailResponse>(`/api/posts/${postId}`);
}

export type FeedResult = {
  readonly recommended: readonly Bubble[];
  readonly rest: readonly Bubble[];
};

/**
 * タイムライン（GET /api/posts/feed）。
 * backendは postId と similarityScore しか返さないため、各投稿を個別に取得して組み立てる。
 * ログイン時は backend がsimilarityScoreを付けて似た境遇のバブルを優先する（FR-FEED-003）。
 * 未ログイン時はsimilarityScoreを付けず新着順で返す（FR-GUEST-004）。
 */
export async function fetchFeed(): Promise<FeedResult> {
  const feedRes = await api.get<{ posts: readonly { postId: string; similarityScore?: number }[] }>(
    "/api/posts/feed",
  );

  const bubbles = await Promise.all(
    feedRes.posts.map(async (entry) => {
      const [post, comments] = await Promise.all([
        fetchPostDetail(entry.postId),
        fetchCommentsOf(entry.postId),
      ]);
      const bubble = await toBubble(post, comments.length);
      return { bubble, similarityScore: entry.similarityScore };
    }),
  );

  const withScore = bubbles.filter((entry) => entry.similarityScore !== undefined && !entry.bubble.isMine);
  const band = withScore.slice(0, 2);
  const bandIds = new Set(band.map((entry) => entry.bubble.id));

  return {
    recommended: band.map((entry) => entry.bubble),
    rest: bubbles.filter((entry) => !bandIds.has(entry.bubble.id)).map((entry) => entry.bubble),
  };
}

/** 空のフィードを見るためのモック操作パネル用。実APIでは空配列を返すだけの簡易実装。 */
export async function fetchEmptyFeed(): Promise<FeedResult> {
  return { recommended: [], rest: [] };
}

export async function fetchBubbleDetail(bubbleId: string): Promise<BubbleDetail | null> {
  try {
    const [post, comments] = await Promise.all([fetchPostDetail(bubbleId), fetchCommentsOf(bubbleId)]);
    const bubble = await toBubble(post, comments.length);
    const soothes = await Promise.all(comments.map((c) => toSoothe(bubbleId, c)));
    return { bubble, soothes };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

/** 本人専用。ゲストのときはローカルの空値のまま（FR-PERSONA-005） */
export async function fetchMe(): Promise<Me> {
  if (viewerIsGuest) {
    return ME;
  }
  const profile = await fetchMyProfile();
  const next: Me = { baby: profile.baby.persona, mother: profile.mother.persona };
  setMe(next);
  return next;
}

/*
 * ────────────── S8 本人専用プロフィール ──────────────
 */

export async function fetchMyProfile(): Promise<MyProfile> {
  const res = await api.get<{
    birthDate: string;
    babyPersona: { id: string; nickname: string; estimatedAge: number | null };
    motherPersona: { id: string; nickname: string; estimatedAge: number | null };
  }>("/api/profile/me");

  const babyPersona: PublicPersona = { id: res.babyPersona.id, kind: "baby", nickname: res.babyPersona.nickname };
  const motherPersona: PublicPersona = {
    id: res.motherPersona.id,
    kind: "mother",
    nickname: res.motherPersona.nickname,
  };
  registerPersonas([babyPersona, motherPersona]);

  const followsRes = await api.get<{
    followingBabies: readonly { babyPersonaId: string }[];
    followingMothers: readonly { motherPersonaId: string }[];
  }>("/api/follows/me");

  return {
    baby: { persona: babyPersona, status: toStatus("baby", res.babyPersona.estimatedAge) },
    mother: { persona: motherPersona, status: toStatus("mother", res.motherPersona.estimatedAge) },
    birthday: res.birthDate,
    followingBabyCount: followsRes.followingBabies.length,
    followingMotherCount: followsRes.followingMothers.length,
  };
}

/**
 * backendのestimatedAgeは「年」（0〜6程度の小数）。frontendのPersonaStatusは「月」で持つため
 * ×12で換算する（design_doc.md 3.4章の推定年齢とfrontendのmonths軸を橋渡しする変換）。
 */
function toStatus(kind: PersonaKind, estimatedAgeYears: number | null): PersonaStatus | null {
  const axis = kind === "baby" ? "赤ちゃん度（文章の幼さ）" : "お母さん度（向けている相手の年齢）";
  if (estimatedAgeYears === null) {
    return { months: 0, label: "まだ わからない", axis, sampleCount: 0 };
  }
  const months = Math.max(0, Math.round(estimatedAgeYears * 12));
  return { months, label: monthsToLabel(months), axis, sampleCount: 1 };
}

function monthsToLabel(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) {
    return String(rest) + "か月";
  }
  return rest === 0 ? String(years) + "歳" : String(years) + "歳" + String(rest) + "か月";
}

/** S8 / S6 共通の一覧。personaIdの公開プロフィールAPIが返すpostIds/commentIdsから組み立てる。 */
async function activityOf(personaId: string, kind: PersonaKind, tab: ActivityTab): Promise<readonly ActivityEntry[]> {
  const path = kind === "baby" ? `/api/personas/baby/${personaId}` : `/api/personas/mother/${personaId}`;
  const res = await api.get<{ postIds?: readonly string[]; commentIds?: readonly string[] }>(path);
  const items: ActivityEntry[] = [];

  if ((tab === "babyBubbles" || tab === "babyAll") && res.postIds) {
    const posts = await Promise.all(
      res.postIds.map(async (id) => {
        const [post, comments] = await Promise.all([fetchPostDetail(id), fetchCommentsOf(id)]);
        return toBubble(post, comments.length);
      }),
    );
    for (const bubble of posts) {
      items.push({ kind: "bubble", bubble });
    }
  }
  if ((tab === "babyAll" || tab === "motherSoothes") && res.commentIds) {
    const soothes = await Promise.all(
      res.commentIds.map(async (id) => {
        // あやす単体の取得APIは無いため、あやすが属するバブルを介してではなく
        // ここでは持っているcommentIdをそのまま id として使い、本文はサーバに
        // 問い合わせずに済ませられない。design_doc.mdにあやす単体取得APIが無いため、
        // 対象のバブルを特定できないと本文を引けない。ここはE2E確認用の簡易実装として
        // 「対象バブルは不明」として抜粋のみのプレースホルダーにする。
        return { id, excerpt: "" };
      }),
    );
    // あやす単体取得APIがdesign_doc.mdに無く、bubbleIdも分からないため一覧化を諦める。
    void soothes;
  }
  items.sort((a, b) => timeOf(b) - timeOf(a));
  return items;
}

function timeOf(item: ActivityEntry): number {
  const iso = item.kind === "bubble" ? item.bubble.createdAt : item.soothe.createdAt;
  return new Date(iso).getTime();
}

export async function fetchMyActivity(tab: ActivityTab): Promise<readonly ActivityEntry[]> {
  const personaId = tab === "motherSoothes" ? ME.mother.id : ME.baby.id;
  const kind: PersonaKind = tab === "motherSoothes" ? "mother" : "baby";
  return activityOf(personaId, kind, tab);
}

export async function fetchPublicActivity(
  personaId: string,
  tab: ActivityTab,
): Promise<readonly ActivityEntry[]> {
  const kind: PersonaKind = tab === "motherSoothes" ? "mother" : "baby";
  return activityOf(personaId, kind, tab);
}

export type CreateBubbleResult =
  | { readonly ok: true; readonly bubble: Bubble }
  | {
      readonly ok: false;
      readonly reason: "too_long" | "moderation" | "empty" | "evaluation" | "ai_unavailable";
    };

export async function createBubble(input: CreateBubbleInput): Promise<CreateBubbleResult> {
  const body = input.body.trim();
  if (body.length === 0) {
    return { ok: false, reason: "empty" };
  }
  if (countChars(body) > BUBBLE_MAX_LENGTH) {
    return { ok: false, reason: "too_long" };
  }

  try {
    const res = await api.post<{ id: string; createdAt: string }>("/api/posts", { body, stamps: [] });
    const post = await fetchPostDetail(res.id);
    const bubble = await toBubble(post, 0);
    return { ok: true, bubble };
  } catch (error) {
    return { ok: false, reason: reasonFromError(error) };
  }
}

function reasonFromError(
  error: unknown,
): "too_long" | "moderation" | "empty" | "evaluation" | "ai_unavailable" {
  if (error instanceof ApiError) {
    if (error.status === 503) {
      return "ai_unavailable";
    }
    if (
      error.reason === "too_long" || error.reason === "moderation" || error.reason === "evaluation"
    ) {
      return error.reason;
    }
  }
  return "moderation";
}

export type CreateSootheResult =
  | { readonly ok: true; readonly soothe: Soothe }
  | {
      readonly ok: false;
      readonly reason:
        | "moderation"
        | "persona_not_allowed"
        | "empty"
        | "evaluation"
        | "ai_unavailable";
    };

export async function createSoothe(input: CreateSootheInput): Promise<CreateSootheResult> {
  const body = input.body.trim();
  if (body.length === 0) {
    return { ok: false, reason: "empty" };
  }

  try {
    const res = await api.post<{ id: string; createdAt: string }>(`/api/posts/${input.bubbleId}/comments`, {
      personaType: input.personaKind,
      body,
      replyToCommentId: input.replyToSootheId,
    });
    const comments = await fetchCommentsOf(input.bubbleId);
    const created = comments.find((c) => c.id === res.id);
    const soothe = created
      ? await toSoothe(input.bubbleId, created)
      : await toSoothe(input.bubbleId, {
          id: res.id,
          personaType: input.personaKind,
          personaId: input.personaKind === "mother" ? ME.mother.id : ME.baby.id,
          body,
          createdAt: res.createdAt,
          replyToCommentId: input.replyToSootheId,
        });
    return { ok: true, soothe };
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return { ok: false, reason: "persona_not_allowed" };
    }
    const reason = reasonFromError(error);
    return { ok: false, reason: reason === "too_long" ? "moderation" : reason };
  }
}

/** スタンプのカタログ（FR-STAMP-001） */
export async function fetchStamps(): Promise<readonly Stamp[]> {
  if (STAMP_CATALOG.length > 0) {
    return STAMP_CATALOG;
  }
  const res = await api.get<{ stamps: readonly { id: string; name: string }[] }>("/api/stamps");
  registerStamps(res.stamps.map((s) => ({ id: s.id, name: s.name })));
  return STAMP_CATALOG;
}

export type AddReactionInput = {
  readonly target: { readonly type: "bubble" | "soothe"; readonly id: string };
  readonly targetKind: ReactionTargetKind;
  readonly reaction: ReactionType;
};

export type AddReactionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "not_allowed" | "own_target" | "max_reached" };

export async function addReaction(input: AddReactionInput): Promise<AddReactionResult> {
  if (!isReactionAllowed(input.targetKind, input.reaction)) {
    return { ok: false, reason: "not_allowed" };
  }

  const path = input.target.type === "bubble"
    ? `/api/posts/${input.target.id}/reactions`
    : `/api/comments/${input.target.id}/reactions`;

  try {
    const res = await api.post<{ counts: Record<string, { total: number; mine: number } | number> }>(
      path,
      { type: input.reaction },
    );
    updateMyReactionCache(input.target.id, input.reaction, res.counts);
    return { ok: true };
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return { ok: false, reason: "own_target" };
    }
    if (error instanceof ApiError && error.status === 409) {
      return { ok: false, reason: "max_reached" };
    }
    return { ok: false, reason: "not_allowed" };
  }
}

function updateMyReactionCache(
  targetId: string,
  reaction: ReactionType,
  counts: Record<string, { total: number; mine: number } | number>,
): void {
  const current = { ...(myReactionCache.get(targetId) ?? {}) };
  // POST /api/posts/:id/reactions は種別ごとの{total,mine}、
  // POST /api/comments/:id/reactions は{[type]:total, mine}という形（design_doc.md 7.1章）。
  const perType = counts[reaction];
  if (typeof perType === "object" && perType !== null) {
    current[reaction] = perType.mine;
  } else if (typeof counts.mine === "number") {
    current[reaction] = counts.mine as number;
  }
  myReactionCache.set(targetId, current);
}

/** FR-POST-006/007：自分のバブルだけ削除できる。不可逆 */
export async function deleteBubble(bubbleId: string): Promise<{ readonly ok: boolean }> {
  try {
    await api.del(`/api/posts/${bubbleId}`);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/*
 * ────────────── S6 他人の公開プロフィール ──────────────
 */

export async function fetchPublicProfile(personaId: string): Promise<PublicProfile | null> {
  const cachedKind = PERSONA_BY_ID[personaId]?.kind;
  const kinds: readonly PersonaKind[] = cachedKind ? [cachedKind] : ["baby", "mother"];

  for (const kind of kinds) {
    try {
      const path = kind === "baby" ? `/api/personas/baby/${personaId}` : `/api/personas/mother/${personaId}`;
      const res = await api.get<{ id: string; nickname: string; bio: string | null }>(path);
      const persona: PublicPersona = { id: res.id, kind, nickname: res.nickname };
      registerPersonas([persona]);

      const followsRes = viewerIsGuest ? null : await api.get<{
        followingBabies: readonly { babyPersonaId: string }[];
        followingMothers: readonly { motherPersonaId: string }[];
      }>("/api/follows/me");
      const liked = followsRes
        ? kind === "baby"
          ? followsRes.followingBabies.some((f) => f.babyPersonaId === personaId)
          : followsRes.followingMothers.some((f) => f.motherPersonaId === personaId)
        : false;

      return {
        persona,
        status: null,
        liked,
        isMe: isMinePersonaId(persona.id),
      };
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        continue;
      }
      throw error;
    }
  }
  return null;
}

export type SetLikedResult = { readonly ok: boolean; readonly liked: boolean };

export async function setLiked(personaId: string, liked: boolean): Promise<SetLikedResult> {
  const kind = PERSONA_BY_ID[personaId]?.kind ?? "baby";
  try {
    if (liked) {
      await api.post("/api/follows", { targetPersonaType: kind, targetPersonaId: personaId });
    } else {
      await api.del("/api/follows", { targetPersonaType: kind, targetPersonaId: personaId });
    }
    return { ok: true, liked };
  } catch {
    return { ok: false, liked: !liked };
  }
}

export async function fetchLikedPersonas(): Promise<{
  readonly baby: readonly PublicPersona[];
  readonly mother: readonly PublicPersona[];
}> {
  const res = await api.get<{
    followingBabies: readonly { babyPersonaId: string }[];
    followingMothers: readonly { motherPersonaId: string }[];
  }>("/api/follows/me");

  const baby = await Promise.all(res.followingBabies.map((f) => resolvePersona("baby", f.babyPersonaId)));
  const mother = await Promise.all(
    res.followingMothers.map((f) => resolvePersona("mother", f.motherPersonaId)),
  );
  return { baby, mother };
}

/*
 * ────────────── S1 アカウント登録 / S0 ログイン ──────────────
 */

const ACCOUNT_ID_PATTERN = /^[a-z0-9_]{3,20}$/;
export const PASSWORD_MIN_LENGTH = 8;
export const NICKNAME_MAX_LENGTH = 20;
export const ACCOUNT_ID_RULE_TEXT = "半角の 英小文字・数字・_ で 3〜20 文字";

type AccountResponse = {
  readonly babyPersona: { readonly id: string; readonly nickname: string };
  readonly motherPersona: { readonly id: string; readonly nickname: string };
  readonly token: string;
};

function toMe(res: AccountResponse): Me {
  return {
    baby: { id: res.babyPersona.id, kind: "baby", nickname: res.babyPersona.nickname },
    mother: { id: res.motherPersona.id, kind: "mother", nickname: res.motherPersona.nickname },
  };
}

export async function createAccount(input: CreateAccountInput): Promise<CreateAccountResult> {
  const accountId = input.accountId.trim();
  if (!ACCOUNT_ID_PATTERN.test(accountId)) {
    return { ok: false, reason: "account_id_invalid" };
  }
  if (input.password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, reason: "password_weak" };
  }
  const baby = input.babyNickname.trim();
  const mother = input.motherNickname.trim();
  if (baby.length === 0 || mother.length === 0) {
    return { ok: false, reason: "nickname_empty" };
  }
  if (countChars(baby) > NICKNAME_MAX_LENGTH || countChars(mother) > NICKNAME_MAX_LENGTH) {
    return { ok: false, reason: "nickname_too_long" };
  }
  if (baby === mother) {
    return { ok: false, reason: "nickname_same" };
  }

  try {
    const res = await api.post<AccountResponse>("/api/accounts", {
      loginId: accountId,
      password: input.password,
      birthDate: "2000-01-01", // 画面に入力欄が無いため仮の値（design_doc.md 10章オープンイシュー）
      babyNickname: baby,
      motherNickname: mother,
    });
    setToken(res.token);
    viewerIsGuest = false;
    const me = toMe(res);
    setMe(me);
    return { ok: true, me };
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      return { ok: false, reason: "account_id_taken" };
    }
    return { ok: false, reason: "nickname_moderation" };
  }
}

export type LoginResult =
  | { readonly ok: true; readonly me: Me }
  | { readonly ok: false; readonly reason: "invalid" };

export async function login(accountId: string, password: string): Promise<LoginResult> {
  try {
    const res = await api.post<AccountResponse>("/api/sessions", {
      loginId: accountId.trim(),
      password,
    });
    setToken(res.token);
    viewerIsGuest = false;
    const me = toMe(res);
    setMe(me);
    return { ok: true, me };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

export async function logout(): Promise<void> {
  try {
    await api.del("/api/sessions");
  } catch {
    // ログアウトはローカルのトークン破棄が主目的。サーバ側呼び出しの失敗は無視する
    // （design_doc.md 6.4章：JWTはステートレスでサーバ側の即時失効を伴わない）。
  } finally {
    setToken(null);
    viewerIsGuest = true;
  }
}

/*
 * ────────────── AI（ComposePanel専用、新設） ──────────────
 */

export type AiEvaluateResult = {
  readonly months: number;
  readonly label: string;
  readonly axis: string;
};

export async function evaluateText(text: string, personaKind: PersonaKind): Promise<AiEvaluateResult> {
  try {
    const res = await api.post<{ estimatedAge: number; passesThreshold: boolean }>("/api/ai/evaluate", {
      body: text,
      personaType: personaKind,
    });
    const months = Math.max(0, Math.round(res.estimatedAge * 12));
    return {
      months,
      label: monthsToLabel(months),
      axis: personaKind === "baby" ? "赤ちゃん度（文章の幼さ）" : "お母さん度（向けている相手の年齢）",
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 503) {
      throw new AiUnavailableError();
    }
    throw error;
  }
}

export type AiTransformResult =
  | { readonly action: "allow"; readonly transformedText: string }
  | { readonly action: "rewrite_required" }
  | { readonly action: "block" };

export async function transformText(text: string, style: PersonaKind): Promise<AiTransformResult> {
  try {
    const res = await api.post<{
      action: "allow" | "rewrite_required" | "block";
      transformedText: string | null;
    }>("/api/ai/transform", { body: text, style });
    if (res.action === "allow" && res.transformedText) {
      return { action: "allow", transformedText: res.transformedText };
    }
    return { action: res.action === "allow" ? "block" : res.action };
  } catch (error) {
    if (error instanceof ApiError && error.status === 503) {
      throw new AiUnavailableError();
    }
    throw error;
  }
}
