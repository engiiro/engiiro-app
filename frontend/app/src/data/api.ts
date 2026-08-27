import { api, ApiError, getToken, setToken } from "./apiClient";
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
  SootheDetail,
  Stamp,
} from "./types";

/*
 * ★ サーバとの境界はこのファイルだけ。
 *
 * docs/design_doc.md §7 の実APIを呼ぶ。設計書にまだ無い口（あやす詳細・返信一覧・
 * 活動履歴）は、実装フェーズの補完として backend 側に追加してもらったものを叩く
 * （2026-08-28、人間監督の指示）。
 *
 * 対応する口:
 *   createAccount       → POST   /api/accounts
 *   login / logout      → POST   /api/sessions / DELETE /api/sessions
 *   fetchMe             → GET    /api/profile/me
 *   fetchMyProfile      → GET    /api/profile/me（S8。両ペルソナのステータス付き）
 *   fetchPublicProfile  → GET    /api/personas/baby/:id / mother/:id
 *   fetchFeed           → GET    /api/posts/feed
 *   fetchBubbleDetail   → GET    /api/posts/:id ＋ GET /api/posts/:id/comments
 *   fetchSootheDetail   → GET    /api/comments/:id ＋ GET /api/comments/:id/comments
 *   createBubble        → POST   /api/posts
 *   createSoothe        → POST   /api/posts/:id/comments
 *   addReaction         → POST   /api/posts/:id/reactions or /api/comments/:id/reactions
 *   deleteBubble        → DELETE /api/posts/:id
 *   fetchStamps         → GET    /api/stamps
 *   fetchLikedPersonas  → GET    /api/follows/me
 *   setLiked            → POST   /api/follows / DELETE /api/follows
 *   fetchMyActivity      → GET    /api/personas/baby/:id （自分のbaby persona idを使う）
 *   fetchPublicActivity  → GET    /api/personas/baby/:id or mother/:id
 *
 * accountId・reactorAccountId・followerAccountId 等の身元情報はどの応答にも
 * 含まれない（FR-COMMON-005 / FR-PRIV-004）ので、ここで組み立て直す必要もない。
 */

/** モック時代の互換用。実APIでは合否はbackendが判定するため実質no-op。 */
export function setAiEvaluateAvailability(_available: boolean): void {
  // 実APIでは何もしない。AIの生死はbackend/aiサービスの実際の状態で決まる。
}

/**
 * モック時代の互換用。実APIでは isMine 等はサーバがトークンから判定するため、
 * クライアント側で閲覧者状態を切り替える必要が無い。呼び出し元（App.tsx）の
 * 既存コードを変えずに済ませるための no-op。
 */
export function setSessionGuest(_guest: boolean): void {
  // 実APIでは何もしない。
}

let me: Me | null = null;
const GUEST_ME: Me = {
  baby: { id: "guest_baby", kind: "baby", nickname: "" },
  mother: { id: "guest_mother", kind: "mother", nickname: "" },
};

/** サーバのペルソナ応答（id, nickname）に kind を足して PublicPersona にする */
function toPersona(kind: PersonaKind, raw: { id: string; nickname: string }): PublicPersona {
  return { id: raw.id, kind, nickname: raw.nickname };
}

interface AuthMeResponse {
  babyPersona: { id: string; nickname: string };
  motherPersona: { id: string; nickname: string };
  token: string;
}

function meFromAuthResponse(data: AuthMeResponse): Me {
  return {
    baby: toPersona("baby", data.babyPersona),
    mother: toPersona("mother", data.motherPersona),
  };
}

/** スタンプカタログを裏で読み込んでおく。BubbleBody の同期参照に間に合わせるため起動時に1回呼ぶ */
let stampsLoading: Promise<void> | null = null;
function ensureStampsLoaded(): Promise<void> {
  stampsLoading ??= fetchStamps().then(() => undefined);
  return stampsLoading;
}

/**
 * 本人専用の情報（GET /api/profile/me 相当）。
 *
 * トークンが無い（ゲスト）ときはサーバへ問い合わせずゲスト用の空ペルソナを返す。
 * 401（期限切れ等）のときはトークンを捨ててゲスト扱いに落とす。
 * それ以外の通信エラーは投げる（App.tsx の bootError で拾い、再試行させる）。
 */
export async function fetchMe(): Promise<Me> {
  await ensureStampsLoaded();
  if (!getToken()) {
    me = GUEST_ME;
    return me;
  }
  try {
    const data = await api.get<{
      birthDate: string;
      babyPersona: { id: string; nickname: string };
      motherPersona: { id: string; nickname: string };
    }>("/api/profile/me");
    me = {
      baby: toPersona("baby", data.babyPersona),
      mother: toPersona("mother", data.motherPersona),
    };
    return me;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      setToken(null);
      me = GUEST_ME;
      return me;
    }
    throw err;
  }
}

function currentMe(): Me {
  return me ?? GUEST_ME;
}

export type FeedResult = {
  readonly recommended: readonly Bubble[];
  readonly rest: readonly Bubble[];
};

interface ApiPersonaRef {
  id: string;
  nickname: string;
}

interface ApiReactionState {
  counts: Partial<Record<ReactionType, number>>;
  mine: Partial<Record<ReactionType, number>>;
}

interface ApiPost {
  id: string;
  author: ApiPersonaRef;
  body: string;
  createdAt: string;
  reactions: ApiReactionState;
  sootheCount: number;
  isMine: boolean;
  similarityScore?: number;
}

function toBubble(post: ApiPost): Bubble {
  return {
    id: post.id,
    author: toPersona("baby", post.author),
    body: post.body,
    createdAt: post.createdAt,
    reactions: post.reactions as ReactionState,
    isMine: post.isMine,
    affinity: post.similarityScore ?? 0,
    sootheCount: post.sootheCount,
  };
}

/**
 * タイムライン（GET /api/posts/feed 相当）。
 * 「おなじくらい つかれてる子」の帯は、返ってきた順のうち自分以外の上位2件とする
 * （backendが似た境遇順に並べて返すため、フロント側で改めて並べ替える必要はない）。
 */
export async function fetchFeed(): Promise<FeedResult> {
  const data = await api.get<{ posts: ApiPost[] }>("/api/posts/feed?limit=30");
  const bubbles = data.posts.map(toBubble);
  const band = bubbles.filter((b) => !b.isMine).slice(0, 2);
  const bandIds = new Set(band.map((b) => b.id));
  return {
    recommended: band,
    rest: bubbles.filter((b) => !bandIds.has(b.id)),
  };
}

/** 空のフィードを見るためのモック専用口。実APIには対応する状態が無いので空を返す */
export async function fetchEmptyFeed(): Promise<FeedResult> {
  return { recommended: [], rest: [] };
}

interface ApiComment {
  id: string;
  author: { id: string; kind: PersonaKind; nickname: string };
  body: string;
  replyToCommentId?: string;
  createdAt: string;
  reactions: ApiReactionState;
  replyCount: number;
  isMine: boolean;
}

function toSoothe(bubbleId: string, c: ApiComment): Soothe {
  return {
    id: c.id,
    bubbleId,
    author: { id: c.author.id, kind: c.author.kind, nickname: c.author.nickname },
    body: c.body,
    createdAt: c.createdAt,
    reactions: c.reactions as ReactionState,
    isMine: c.isMine,
    replyToSootheId: c.replyToCommentId,
    replyCount: c.replyCount,
  };
}

export async function fetchBubbleDetail(bubbleId: string): Promise<BubbleDetail | null> {
  try {
    const [post, commentsRes] = await Promise.all([
      api.get<ApiPost>(`/api/posts/${bubbleId}`),
      api.get<{ comments: ApiComment[] }>(`/api/posts/${bubbleId}/comments`),
    ]);
    return {
      bubble: toBubble(post),
      soothes: commentsRes.comments.map((c) => toSoothe(bubbleId, c)),
    };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function fetchSootheDetail(sootheId: string): Promise<SootheDetail | null> {
  try {
    const data = await api.get<{
      soothe: ApiComment;
      bubbleId: string;
      bubbleExcerpt: string;
      bubbleIsMine: boolean;
      replyToNickname?: string;
    }>(`/api/comments/${sootheId}`);
    const [repliesRes] = await Promise.all([
      api.get<{ comments: ApiComment[] }>(`/api/comments/${sootheId}/comments`),
    ]);
    return {
      soothe: toSoothe(data.bubbleId, data.soothe),
      bubbleId: data.bubbleId,
      bubbleExcerpt: data.bubbleExcerpt,
      bubbleIsMine: data.bubbleIsMine,
      replyToNickname: data.replyToNickname,
      replies: repliesRes.comments.map((c) => toSoothe(data.bubbleId, c)),
    };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/*
 * ────────────── S8 本人専用プロフィール ──────────────
 */

export async function fetchMyProfile(): Promise<MyProfile> {
  const data = await api.get<{
    birthDate: string;
    babyPersona: { id: string; nickname: string; estimatedAge: number | null };
    motherPersona: { id: string; nickname: string; estimatedAge: number | null };
    followingBabyCount?: number;
    followingMotherCount?: number;
  }>("/api/profile/me");

  const [likedBaby, likedMother] = await Promise.all([
    countFollowing("baby"),
    countFollowing("mother"),
  ]);

  return {
    baby: {
      persona: toPersona("baby", data.babyPersona),
      status: statusFromEstimate(data.babyPersona.estimatedAge, "baby"),
    },
    mother: {
      persona: toPersona("mother", data.motherPersona),
      status: statusFromEstimate(data.motherPersona.estimatedAge, "mother"),
    },
    birthday: data.birthDate,
    followingBabyCount: likedBaby,
    followingMotherCount: likedMother,
  };
}

/**
 * サーバの推定年齢（0〜6の実数、ai/src/evaluate.py参照）を画面向けの
 * PersonaStatus（何か月相当か・ラベル）へ変換する。
 * サンプル件数はサーバが返さないため、推定値が無ければ0件・あれば1件以上とみなす
 * （NFR-002：使えないときはnullにする、の判定にだけ使う）。
 */
function statusFromEstimate(
  estimatedAge: number | null,
  kind: PersonaKind,
): PersonaStatus | null {
  const axis = kind === "baby" ? "赤ちゃん度（文章の幼さ）" : "お母さん度（向けている相手の年齢）";
  if (estimatedAge === null) {
    return { months: 0, label: "まだ わからない", axis, sampleCount: 0 };
  }
  const months = Math.round(estimatedAge * 12);
  return { months, label: monthsToLabel(months), axis, sampleCount: 1 };
}

function monthsToLabel(months: number): string {
  if (months <= 6) return "あかちゃん";
  if (months <= 18) return "よちよち";
  if (months <= 36) return "こども";
  return "おとな";
}

async function countFollowing(kind: PersonaKind): Promise<number> {
  const liked = await fetchLikedPersonas();
  return kind === "baby" ? liked.baby.length : liked.mother.length;
}

/** 1つのペルソナの活動一覧を組み立てる。postIds/commentIdsから詳細をまとめて取る */
async function activityFor(
  kind: PersonaKind,
  personaId: string,
  tab: ActivityTab,
): Promise<readonly ActivityEntry[]> {
  const data = await api.get<{
    id: string;
    nickname: string;
    postIds?: string[];
    commentIds?: string[];
  }>(`/api/personas/${kind}/${personaId}`);

  const items: ActivityEntry[] = [];

  if (tab === "babyBubbles" || tab === "babyAll") {
    const postIds = data.postIds ?? [];
    const posts = await Promise.all(
      postIds.map((id) => api.get<ApiPost>(`/api/posts/${id}`).catch(() => null)),
    );
    for (const post of posts) {
      if (post) items.push({ kind: "bubble", bubble: toBubble(post) });
    }
  }

  if (tab === "babyAll" || tab === "motherSoothes") {
    const commentIds = data.commentIds ?? [];
    const comments = await Promise.all(
      commentIds.map((id) =>
        api
          .get<{ soothe: ApiComment; bubbleId: string; bubbleExcerpt: string }>(
            `/api/comments/${id}`,
          )
          .catch(() => null)
      ),
    );
    for (const c of comments) {
      if (c) {
        items.push({
          kind: "soothe",
          soothe: toSoothe(c.bubbleId, c.soothe),
          toBubbleExcerpt: c.bubbleExcerpt,
        });
      }
    }
  }

  items.sort((a, b) => timeOf(b) - timeOf(a));
  return items;
}

function timeOf(item: ActivityEntry): number {
  const iso = item.kind === "bubble" ? item.bubble.createdAt : item.soothe.createdAt;
  return new Date(iso).getTime();
}

export async function fetchMyActivity(tab: ActivityTab): Promise<readonly ActivityEntry[]> {
  const self = currentMe();
  const personaId = tab === "motherSoothes" ? self.mother.id : self.baby.id;
  const kind: PersonaKind = tab === "motherSoothes" ? "mother" : "baby";
  return activityOfSelf(kind, personaId, tab);
}

// 自分の活動一覧は「自分のペルソナのpostIds/commentIds」を使うだけで、
// 公開活動一覧（activityFor）とロジックは同じ。ゲストは呼ばない前提（App.tsx側）。
function activityOfSelf(
  kind: PersonaKind,
  personaId: string,
  tab: ActivityTab,
): Promise<readonly ActivityEntry[]> {
  return activityFor(kind, personaId, tab);
}

/*
 * ────────────── S1 アカウント登録・ログイン ──────────────
 */

export const PASSWORD_MIN_LENGTH = 8;
export const NICKNAME_MAX_LENGTH = 20;
export const ACCOUNT_ID_RULE_TEXT = "半角の 英小文字・数字・_ で 3〜20 文字";
export const BIRTHDAY_MIN = "1900-01-01";

export function todayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return String(now.getFullYear()) + "-" + month + "-" + day;
}

export async function createAccount(input: CreateAccountInput): Promise<CreateAccountResult> {
  try {
    const data = await api.post<AuthMeResponse>("/api/accounts", {
      loginId: input.accountId,
      password: input.password,
      birthDate: input.birthday,
      babyNickname: input.babyNickname,
      motherNickname: input.motherNickname,
    });
    setToken(data.token);
    const result = meFromAuthResponse(data);
    me = result;
    return { ok: true, me: result };
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 409) return { ok: false, reason: "account_id_taken" };
      // それ以外のバリデーション不備は、画面の入力チェックで既に弾いている前提の
      // 粗い区分に丸める（サーバのメッセージそのものは表示側の契約に無い）。
      return { ok: false, reason: "account_id_invalid" };
    }
    throw err;
  }
}

export type LoginResult =
  | { readonly ok: true; readonly me: Me }
  | { readonly ok: false; readonly reason: "invalid" };

export async function login(accountId: string, password: string): Promise<LoginResult> {
  try {
    const data = await api.post<AuthMeResponse>("/api/sessions", {
      loginId: accountId,
      password,
    });
    setToken(data.token);
    const result = meFromAuthResponse(data);
    me = result;
    return { ok: true, me: result };
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      return { ok: false, reason: "invalid" };
    }
    throw err;
  }
}

export async function logout(): Promise<void> {
  try {
    await api.del("/api/sessions");
  } finally {
    setToken(null);
    me = GUEST_ME;
  }
}

/*
 * ────────────── バブル・あやすの作成 ──────────────
 */

export type CreateBubbleResult =
  | { readonly ok: true; readonly bubble: Bubble }
  | {
      readonly ok: false;
      readonly reason: "too_long" | "moderation" | "empty" | "evaluation" | "ai_unavailable";
    };

function reasonFromError(err: ApiError): "too_long" | "moderation" | "evaluation" | "ai_unavailable" {
  if (err.reason === "too_long") return "too_long";
  if (err.reason === "ai_unavailable" || err.status === 503) return "ai_unavailable";
  if (err.reason === "evaluation") return "evaluation";
  return "moderation";
}

export async function createBubble(input: CreateBubbleInput): Promise<CreateBubbleResult> {
  const body = input.body.trim();
  if (body.length === 0) {
    return { ok: false, reason: "empty" };
  }
  try {
    const created = await api.post<{ id: string; createdAt: string }>("/api/posts", {
      body,
      stamps: [],
    });
    const bubble: Bubble = {
      id: created.id,
      author: currentMe().baby,
      body,
      createdAt: created.createdAt,
      reactions: { counts: {}, mine: {} },
      isMine: true,
      affinity: 1,
      sootheCount: 0,
    };
    return { ok: true, bubble };
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, reason: reasonFromError(err) };
    }
    throw err;
  }
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
    const created = await api.post<{ id: string; createdAt: string }>(
      `/api/posts/${input.bubbleId}/comments`,
      {
        personaType: input.personaKind,
        body,
        ...(input.replyToSootheId ? { replyToCommentId: input.replyToSootheId } : {}),
      },
    );
    const author = input.personaKind === "mother" ? currentMe().mother : currentMe().baby;
    const soothe: Soothe = {
      id: created.id,
      bubbleId: input.bubbleId,
      author,
      body,
      createdAt: created.createdAt,
      reactions: { counts: {}, mine: {} },
      isMine: true,
      replyToSootheId: input.replyToSootheId,
      replyCount: 0,
    };
    return { ok: true, soothe };
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 403) return { ok: false, reason: "persona_not_allowed" };
      // CreateSootheResultにtoo_longは無い（あやすの文字数上限は画面側で先に止める設計）。
      // サーバがそれでもtoo_longを返した場合はmoderationへ丸める。
      const reason = reasonFromError(err);
      return { ok: false, reason: reason === "too_long" ? "moderation" : reason };
    }
    throw err;
  }
}

export async function fetchStamps(): Promise<readonly Stamp[]> {
  const data = await api.get<{ stamps: { id: string; name: string; imageUrl: string }[] }>(
    "/api/stamps",
  );
  // GET /api/stamps の応答（設計書§7）には shelf が無い。backend側の追加が要るため、
  // 決まるまでは全部「そのほか」として扱う（stampGroups側のフォールバック棚に入る）。
  const stamps: Stamp[] = data.stamps.map((s) => ({
    id: s.id,
    name: s.name,
    imageUrl: s.imageUrl,
    shelf: "reply",
  }));
  registerStamps(stamps);
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
    await api.post(path, { type: input.reaction });
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 403) return { ok: false, reason: "own_target" };
      if (err.status === 409) return { ok: false, reason: "max_reached" };
      return { ok: false, reason: "not_allowed" };
    }
    throw err;
  }
}

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

const resolvedKindById = new Map<string, PersonaKind>();

/**
 * personaIdだけからkindが分からないため、baby側→mother側の順で試す
 * （FR-PERSONA-004：呼び出し元はkindを持たずidだけを渡す設計のため）。
 * 一度分かれば以後はキャッシュを使い、活動一覧取得（fetchPublicActivity）で
 * 二度引きしない。
 */
async function resolvePersonaKind(personaId: string): Promise<PersonaKind | null> {
  const cached = resolvedKindById.get(personaId);
  if (cached) return cached;

  for (const kind of ["baby", "mother"] as const) {
    try {
      await api.get(`/api/personas/${kind}/${personaId}`);
      resolvedKindById.set(personaId, kind);
      return kind;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) continue;
      throw err;
    }
  }
  return null;
}

export async function fetchPublicProfile(personaId: string): Promise<PublicProfile | null> {
  const kind = await resolvePersonaKind(personaId);
  if (!kind) return null;

  const [personaData, likedResult, estimateData] = await Promise.all([
    api.get<{ id: string; nickname: string; bio: string | null }>(
      `/api/personas/${kind}/${personaId}`,
    ),
    fetchLikedPersonas(),
    // 推定年齢は本人専用の口にしか無いため、他人の分は出せない状態がサーバ側の現状。
    // 決まるまではnull（NFR-002と同じ立場：使える材料が無ければnullのまま）。
    Promise.resolve<number | null>(null),
  ]);

  const likedSet = kind === "baby" ? likedResult.baby : likedResult.mother;
  const self = currentMe();
  return {
    persona: toPersona(kind, personaData),
    status: statusFromEstimate(estimateData, kind),
    liked: likedSet.some((p) => p.id === personaId),
    isMe: personaId === self.baby.id || personaId === self.mother.id,
  };
}

export async function fetchPublicActivity(
  personaId: string,
  tab: ActivityTab,
): Promise<readonly ActivityEntry[]> {
  const kind = await resolvePersonaKind(personaId);
  if (!kind) return [];
  return activityFor(kind, personaId, tab);
}

export type SetLikedResult = { readonly ok: boolean; readonly liked: boolean };

export async function setLiked(personaId: string, liked: boolean): Promise<SetLikedResult> {
  const kind = await resolvePersonaKind(personaId);
  if (!kind) return { ok: false, liked: false };
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
  try {
    const data = await api.get<{
      followingBabies: { babyPersonaId: string }[];
      followingMothers: { motherPersonaId: string }[];
    }>("/api/follows/me");
    // GET /api/follows/me はidのみを返す（設計書§7）。nicknameは別途要る画面
    // （S7一覧等）のために、それぞれ引き直す。
    const [babies, mothers] = await Promise.all([
      Promise.all(
        data.followingBabies.map((f) =>
          api
            .get<{ id: string; nickname: string }>(`/api/personas/baby/${f.babyPersonaId}`)
            .then((p) => toPersona("baby", p))
            .catch(() => null)
        ),
      ),
      Promise.all(
        data.followingMothers.map((f) =>
          api
            .get<{ id: string; nickname: string }>(`/api/personas/mother/${f.motherPersonaId}`)
            .then((p) => toPersona("mother", p))
            .catch(() => null)
        ),
      ),
    ]);
    return {
      baby: babies.filter((p): p is PublicPersona => p !== null),
      mother: mothers.filter((p): p is PublicPersona => p !== null),
    };
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return { baby: [], mother: [] };
    throw err;
  }
}
