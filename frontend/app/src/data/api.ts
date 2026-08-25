import { mockAiEvaluate, monthsToLabel } from "../lib/mockAiEvaluate";
import { AiUnavailableError } from "../lib/mockAiTransform";
import { moderate } from "../lib/mockModeration";
import { BUBBLE_MAX_LENGTH, REACTION_MAX_PER_USER, countChars } from "./constants";
import { BUBBLE_SEEDS } from "./bubbles";
import { BABY_PERSONAS, ME, MOTHER_PERSONAS, PERSONA_BY_ID, setMe } from "./personas";
import { isReactionAllowed } from "./reactions";
import { SOOTHE_SEEDS } from "./soothes";
import { STAMP_CATALOG } from "./stamps";
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
 * 実 API に差し替えるときは、ここの各関数の中身を fetch に置き換える。画面側は触らない。
 * 対応する口は docs/design_doc.md §7：
 *   createAccount      → POST /api/accounts（S1。設計書に未記載。FR-ACCOUNT-001/002 の受け皿）
 *   login / logout     → POST /api/sessions / DELETE /api/sessions（同）
 *   fetchMe            → GET  /api/profile/me
 *   fetchMyProfile      → GET  /api/profile/me（S8。両ペルソナのステータス付き）
 *   fetchMyActivity     → GET  /api/profile/me/activity（設計書に未記載）
 *   fetchPublicProfile  → GET  /api/personas/:id（S6。設計書に未記載。FR-PROFILE-005 の受け皿）
 *   fetchPublicActivity → GET  /api/personas/:id/activity（同）
 *   fetchLikedPersonas  → GET  /api/profile/me/following（S7。本人だけが引ける）
 *   setLiked            → POST / DELETE /api/personas/:id/follow
 *   fetchFeed          → GET  /api/posts/feed
 *   fetchBubbleDetail  → GET  /api/posts/:id（+ あやす一覧。読み取り系は Issue #8 で未確定）
 *   createBubble       → POST /api/posts
 *   createSoothe       → POST /api/posts/:id/comments
 *   addReaction        → POST /api/posts/:id/reactions
 *   fetchStamps        → GET  /api/stamps
 *   deleteBubble       → DELETE /api/posts/:id（設計書に未記載。FR-POST-006 の受け皿）
 *
 * ここで返す形は「外部向けレスポンス」と同じ制約に従う。accountId を持たせない
 * （FR-COMMON-005）。フォロワーに相当する情報も返さない（OUT-004）。
 */

/**
 * モックの応答遅延。動きのトークンではなく「通信の遅さ」の代わり。
 * skeleton と「変換しています」を実際に目で見るために必要な待ち時間。
 */
const MOCK_LATENCY_MS = 520;

/*
 * サーバ側から見た「AI 文章評価」の生死。モック操作帯の「AI評価」がここを動かす。
 *
 * 評価は投稿の関門なので（FR-AI-EVAL-007 / NFR-003、2026-08-25 の PO 改訂）、
 * 評価が落ちていれば保存もできない。画面側でもボタンを止めるが、止めるのはこちら。
 *
 * 「AI 文章生成（変換）」は別物で、ここには関係しない。
 * 生成が落ちていても投稿とあやすは続けられる（NFR-001。PO 回答 2026-08-25、Issue #19）。
 */
let evaluateAvailable = true;

/*
 * 閲覧者がログインしているかどうか。
 *
 * isMine は「閲覧者にとって自分のものか」なので、誰が見ているかで変わる。
 * ゲストには自分のバブルもあやすも無い。サーバなら閲覧者ごとに計算して返すところを、
 * モックでは1人ぶんしか持っていないので、返す直前に落とす。
 *
 * 既定はゲスト（人間の指示、2026-08-26）。App の初期値と合わせてある。
 */
let viewerIsGuest = true;

export function setSessionGuest(guest: boolean): void {
  viewerIsGuest = guest;
}

/** 閲覧者から見た形にして返す。ゲストには「自分のもの」が無い */
function asViewer<T extends { readonly isMine: boolean }>(item: T): T {
  return viewerIsGuest ? { ...item, isMine: false } : item;
}

export function setAiEvaluateAvailability(available: boolean): void {
  evaluateAvailable = available;
}

/** 画面を開いた時刻を基準に、ダミーの相対時刻を絶対時刻へ直す */
const BOOT_TIME = Date.now();
const MINUTE_MS = 60000;

function isoMinutesAgo(minutes: number): string {
  return new Date(BOOT_TIME - minutes * MINUTE_MS).toISOString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/*
 * モックの保存先。画面側から直接書き換えず、必ず下の関数を通す。
 * サーバが持っている状態のつもりで扱う。
 */
let bubbles: Bubble[] = BUBBLE_SEEDS.map((seed) => ({
  id: seed.id,
  author: seed.author,
  body: seed.body,
  createdAt: isoMinutesAgo(seed.minutesAgo),
  reactions: seed.reactions,
  isMine: seed.isMine,
  read: seed.read,
  affinity: seed.affinity,
  sootheCount: seed.sootheCount,
}));

let soothes: Soothe[] = SOOTHE_SEEDS.map((seed) => ({
  id: seed.id,
  bubbleId: seed.bubbleId,
  author: seed.author,
  body: seed.body,
  createdAt: isoMinutesAgo(seed.minutesAgo),
  reactions: seed.reactions,
  // 自分のあやすには自分でリアクションできない。判定に使うだけの真偽値で、識別子ではない
  isMine: seed.author.id === ME.baby.id || seed.author.id === ME.mother.id,
  replyToSootheId: seed.replyToSootheId,
}));

let idCounter = 0;

function nextId(prefix: string): string {
  idCounter += 1;
  return prefix + "_new_" + String(idCounter);
}

export type FeedResult = {
  /** 「おなじくらい つかれてる子」の帯に出すバブル */
  readonly recommended: readonly Bubble[];
  /** その下に続くバブル */
  readonly rest: readonly Bubble[];
};

/**
 * タイムライン。
 *
 * FR-FEED-002：単純な新着順のみで構成しない。
 * FR-FEED-003：閲覧者の赤ちゃんペルソナと近いバブルを優先して含める。
 * ここでは affinity（AI 文章評価の結果の代わり）と新しさを混ぜた点数で並べ、
 * 上位のいくつかを帯として切り出す。本物のロジックは backend 側の担当。
 */
export async function fetchFeed(): Promise<FeedResult> {
  await sleep(MOCK_LATENCY_MS);

  const scored = bubbles.map((bubble) => {
    const ageMinutes = (BOOT_TIME - new Date(bubble.createdAt).getTime()) / MINUTE_MS;
    const freshness = 1 / (1 + ageMinutes / 120);
    return { bubble, score: bubble.affinity * 0.65 + freshness * 0.35 };
  });
  scored.sort((a, b) => b.score - a.score);

  // 自分のバブルは「おなじくらい つかれてる子」の帯に出さない
  const band = scored.filter((entry) => !entry.bubble.isMine).slice(0, 2);
  const bandIds = new Set(band.map((entry) => entry.bubble.id));

  return {
    recommended: band.map((entry) => asViewer(entry.bubble)),
    rest: scored
      .filter((entry) => !bandIds.has(entry.bubble.id))
      .map((entry) => asViewer(entry.bubble)),
  };
}

/** 空のフィードを見るためのモック用。実 API 差し替え時には消える */
export async function fetchEmptyFeed(): Promise<FeedResult> {
  await sleep(MOCK_LATENCY_MS);
  return { recommended: [], rest: [] };
}

export async function fetchBubbleDetail(bubbleId: string): Promise<BubbleDetail | null> {
  await sleep(MOCK_LATENCY_MS);
  const bubble = bubbles.find((item) => item.id === bubbleId);
  if (!bubble) {
    return null;
  }
  return {
    bubble: asViewer(bubble),
    soothes: soothes.filter((item) => item.bubbleId === bubbleId).map(asViewer),
  };
}

/** 本人専用。両ペルソナをまとめて返すのはこの口だけ（FR-PERSONA-005） */
export async function fetchMe(): Promise<Me> {
  return ME;
}

/*
 * ────────────── S8 本人専用プロフィール ──────────────
 *
 * ここから下は「本人が自分を見る」ときだけ通る口。
 * 両ペルソナが同じ戻り値に入るのはここだけで、公開系の口へ持ち出さない（FR-PERSONA-005）。
 */

/** 生年月日。仕様書に項目が無い（人間の指示、2026-08-25 のモック）ので固定値 */
const MY_BIRTHDAY = "2023-04-15";

/**
 * フォロー「中」のペルソナ。本人だけが引ける（FR-FOLLOW-003）。
 *
 * ★ 「誰が自分をフォローしているか」を持つ入れ物は、この先も作らない。
 *   フォロワー一覧もフォロワー数も、本人を含む誰にも出さない（FR-FOLLOW-004/005、OUT-004）。
 */
const following = new Set<string>([
  BABY_PERSONAS.sheep.id,
  BABY_PERSONAS.taputapu.id,
  BABY_PERSONAS.yowane.id,
  BABY_PERSONAS.puni.id,
  MOTHER_PERSONAS.okan.id,
  MOTHER_PERSONAS.yoshiyoshi.id,
]);

/**
 * S8 本人専用プロフィール（GET /api/profile/me 相当）。
 *
 * 赤ちゃん度と お母さん度は、材料にする文章が違う：
 *   FR-PROFILE-003  赤ちゃん度 … 本人のバブル ＋ 赤ちゃんとしてのあやす
 *   FR-PROFILE-004  お母さん度 … 本人のお母さんとしてのあやす だけ
 * お母さんとしてのあやすだけを投稿しても赤ちゃん度が動かないのは、この分け方で担保する。
 *
 * FR-AI-EVAL-002：2つは別の軸。同じ尺度の値として足したり比べたりしない。
 * NFR-002：評価が使えないときは status を null にして、その旨を画面に出させる。
 *          プロフィールそのものは読めるままにする。
 */
export async function fetchMyProfile(): Promise<MyProfile> {
  const babyTexts = textsFor(ME.baby.id, "baby");
  const motherTexts = textsFor(ME.mother.id, "mother");

  const [baby, mother] = await Promise.all([
    statusOf(babyTexts, "baby"),
    statusOf(motherTexts, "mother"),
  ]);

  return {
    baby: { persona: ME.baby, status: baby },
    mother: { persona: ME.mother, status: mother },
    birthday: MY_BIRTHDAY,
    followingBabyCount: countFollowing("baby"),
    followingMotherCount: countFollowing("mother"),
  };
}

/**
 * S8 の一覧。3つの切り替えは、どれも本人の行動しか含まない。
 * 新しい順に並べる（自分の記録なので、ここは新着順でよい。FR-FEED-002 はタイムラインの要件）。
 */
export async function fetchMyActivity(tab: ActivityTab): Promise<readonly ActivityEntry[]> {
  await sleep(MOCK_LATENCY_MS);
  const personaId = tab === "motherSoothes" ? ME.mother.id : ME.baby.id;
  return activityOf(personaId, tab);
}

/**
 * 1つのペルソナぶんの一覧。S8 も S6 もここを通る。
 *
 * ★ 引数はペルソナ id ひとつ。「この人のもう一方のペルソナ」を混ぜる道が構造として無い。
 *   ここに accountId を渡す形にすると、その時点で非連結が崩せる（FR-PERSONA-003）。
 */
function activityOf(personaId: string, tab: ActivityTab): readonly ActivityEntry[] {
  const items: ActivityEntry[] = [];
  if (tab === "babyBubbles" || tab === "babyAll") {
    for (const bubble of bubblesOf(personaId)) {
      items.push({ kind: "bubble", bubble });
    }
  }
  if (tab === "babyAll" || tab === "motherSoothes") {
    for (const soothe of soothesOf(personaId)) {
      items.push({ kind: "soothe", soothe, toBubbleExcerpt: excerptOf(soothe.bubbleId) });
    }
  }
  items.sort((a, b) => timeOf(b) - timeOf(a));
  return items;
}

function timeOf(item: ActivityEntry): number {
  const iso = item.kind === "bubble" ? item.bubble.createdAt : item.soothe.createdAt;
  return new Date(iso).getTime();
}

function bubblesOf(personaId: string): readonly Bubble[] {
  return bubbles.filter((bubble) => bubble.author.id === personaId);
}

function soothesOf(personaId: string): readonly Soothe[] {
  return soothes.filter((soothe) => soothe.author.id === personaId);
}

/**
 * 推定の材料にする文章を集める。
 *   FR-PROFILE-003  赤ちゃん度 … そのペルソナのバブル ＋ 赤ちゃんとしてのあやす
 *   FR-PROFILE-004  お母さん度 … そのペルソナのお母さんとしてのあやす だけ
 */
function textsFor(personaId: string, kind: PersonaKind): readonly string[] {
  const soothed = soothesOf(personaId).map((soothe) => soothe.body);
  if (kind === "mother") {
    return soothed;
  }
  return [...bubblesOf(personaId).map((bubble) => bubble.body), ...soothed];
}

/** あやすが どのバブルへのものか思い出すための抜粋。長い本文は途中で切る */
const EXCERPT_MAX = 24;

function excerptOf(bubbleId: string): string {
  const target = bubbles.find((bubble) => bubble.id === bubbleId);
  if (!target) {
    return "けされた バブル";
  }
  const chars = [...target.body];
  return chars.length <= EXCERPT_MAX ? target.body : chars.slice(0, EXCERPT_MAX).join("") + "…";
}

function countFollowing(kind: PersonaKind): number {
  let count = 0;
  for (const id of following) {
    if (PERSONA_BY_ID[id]?.kind === kind) {
      count += 1;
    }
  }
  return count;
}

/**
 * 集めた文章から ステータスを1つ作る。
 *
 * 1件ずつ評価して平均を取る。文章をつないで1回で評価すると、
 * 長い1件が全体を引っぱるため。実際の算出は backend / ai 側の担当で、ここは形だけ。
 */
async function statusOf(
  texts: readonly string[],
  personaKind: PersonaKind,
): Promise<PersonaStatus | null> {
  const axis =
    personaKind === "baby" ? "赤ちゃん度（文章の幼さ）" : "お母さん度（向けている相手の年齢）";
  if (texts.length === 0) {
    // まだ材料が無い。0歳として断定せず、件数 0 のまま返して画面に判断させる
    return { months: 0, label: "まだ わからない", axis, sampleCount: 0 };
  }
  try {
    const results = await Promise.all(
      texts.map((text) => mockAiEvaluate(text, personaKind, { available: evaluateAvailable })),
    );
    const months = Math.round(
      results.reduce((sum, result) => sum + result.months, 0) / results.length,
    );
    return { months, label: monthsToLabel(months), axis, sampleCount: texts.length };
  } catch (error) {
    if (error instanceof AiUnavailableError) {
      // NFR-002：使えないことを伝える。プロフィールは読めるままにする
      return null;
    }
    throw error;
  }
}

export type CreateBubbleResult =
  | { readonly ok: true; readonly bubble: Bubble }
  | {
      readonly ok: false;
      readonly reason: "too_long" | "moderation" | "empty" | "evaluation" | "ai_unavailable";
    };

/**
 * バブルの作成。
 *
 * NFR-005：上限超過を保存前に拒否する。
 * FR-MOD-003：保存される最終的な本文をモデレーションの対象にする。
 * FR-MOD-004：クライアントの申告した判定結果は受け取らない（引数に判定結果を置いていない）。
 * 返す reason は表示の切り替えに使う粗い区分で、判定の内部情報ではない（FR-MOD-034）。
 */
export async function createBubble(input: CreateBubbleInput): Promise<CreateBubbleResult> {
  await sleep(MOCK_LATENCY_MS);

  const body = input.body.trim();
  if (body.length === 0) {
    return { ok: false, reason: "empty" };
  }
  if (countChars(body) > BUBBLE_MAX_LENGTH) {
    return { ok: false, reason: "too_long" };
  }
  if (moderate(body) === "violation") {
    // 伏せ字にして保存しない（FR-MOD-031）。検出した原文もここに残さない（FR-PRIV-002）
    return { ok: false, reason: "moderation" };
  }
  // FR-AI-EVAL-007：閾値を超えなかったものは保存しない。バブルは常に赤ちゃん
  const gate = await evaluateGate(body, "baby");
  if (gate !== "ok") {
    return { ok: false, reason: gate };
  }

  const bubble: Bubble = {
    id: nextId("bubble"),
    author: ME.baby, // バブルは常に赤ちゃんペルソナ（FR-POST-001/003）
    body,
    createdAt: new Date().toISOString(),
    reactions: { counts: {}, mine: {} },
    isMine: true,
    read: true,
    affinity: 1,
    sootheCount: 0,
  };
  bubbles = [bubble, ...bubbles];
  return { ok: true, bubble };
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

/**
 * あやすの作成。
 *
 * FR-COMMENT-006：お母さんとしてのあやすを返信先とするとき、お母さんペルソナでは作成しない。
 * 画面で選択肢を出さないだけでは足りないので、この境界でも弾く。
 * （本番では同じ判定をサーバ側で必ず行う。フロントの判定は保証にならない）
 */
export async function createSoothe(input: CreateSootheInput): Promise<CreateSootheResult> {
  await sleep(MOCK_LATENCY_MS);

  const body = input.body.trim();
  if (body.length === 0) {
    return { ok: false, reason: "empty" };
  }

  const replyTo = input.replyToSootheId
    ? soothes.find((item) => item.id === input.replyToSootheId)
    : undefined;
  if (replyTo && replyTo.author.kind === "mother" && input.personaKind === "mother") {
    return { ok: false, reason: "persona_not_allowed" };
  }
  if (moderate(body) === "violation") {
    return { ok: false, reason: "moderation" };
  }
  const gate = await evaluateGate(body, input.personaKind);
  if (gate !== "ok") {
    return { ok: false, reason: gate };
  }

  const soothe: Soothe = {
    id: nextId("soothe"),
    bubbleId: input.bubbleId,
    author: personaOf(input.personaKind),
    body,
    createdAt: new Date().toISOString(),
    reactions: { counts: {}, mine: {} },
    isMine: true,
    replyToSootheId: input.replyToSootheId,
  };
  soothes = [...soothes, soothe];
  bubbles = bubbles.map((bubble) =>
    bubble.id === input.bubbleId ? { ...bubble, sootheCount: bubble.sootheCount + 1 } : bubble,
  );
  return { ok: true, soothe };
}

/**
 * 保存を許す上限の月齢。**backend が持つ値**（PO 決定 2026-08-25、Issue #19）。
 *
 * 「はかる」ボタンで利用者に見せる指標とは別物で、こちらは
 * データベースに保存してよいかを決めるためだけの数値。
 * 画面側はこの値を知らないし、知る必要もない。export しないのはそのため。
 *
 * 3歳（36か月）以下を通す仮置き。実際の値は backend の実装で決まる。
 */
const EVALUATE_PASS_MAX_MONTHS = 36;

/**
 * 保存してよいかを AI 評価で判定する（FR-AI-EVAL-007 / NFR-003）。
 * 評価そのものが使えないときは保存しない（NFR-004 と同じ立場）。
 *
 * AI が返すのは指標だけ。閾値と突き合わせて可否を決めるのはここ（backend）の仕事。
 */
async function evaluateGate(
  body: string,
  personaKind: PersonaKind,
): Promise<"ok" | "evaluation" | "ai_unavailable"> {
  try {
    const result = await mockAiEvaluate(body, personaKind, { available: evaluateAvailable });
    return result.months <= EVALUATE_PASS_MAX_MONTHS ? "ok" : "evaluation";
  } catch (error) {
    if (error instanceof AiUnavailableError) {
      return "ai_unavailable";
    }
    throw error;
  }
}

function personaOf(kind: PersonaKind): PublicPersona {
  return kind === "mother" ? ME.mother : ME.baby;
}

/** スタンプのカタログ（FR-STAMP-001） */
export async function fetchStamps(): Promise<readonly Stamp[]> {
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

/**
 * リアクションを1回足す。
 *
 * FR-REACT-007：許可されていない対象とリアクションの組み合わせは保存しない。
 * 画面がそもそも出さないうえで、この境界でも弾く二重化。
 *
 * 自分のバブルと自分のあやすには、自分でリアクションできない（人間の決定、2026-08-24）。
 * 1種類につき 5 回まで（同、2026-08-25）。上限を超える要求は保存しない。
 * 画面側もボタンを止めるが、止めるのはこちら。
 */
export async function addReaction(input: AddReactionInput): Promise<AddReactionResult> {
  if (!isReactionAllowed(input.targetKind, input.reaction)) {
    return { ok: false, reason: "not_allowed" };
  }
  if (isOwnTarget(input.target)) {
    return { ok: false, reason: "own_target" };
  }
  if (currentMine(input) >= REACTION_MAX_PER_USER) {
    return { ok: false, reason: "max_reached" };
  }

  if (input.target.type === "bubble") {
    bubbles = bubbles.map((bubble) =>
      bubble.id === input.target.id
        ? { ...bubble, reactions: bump(bubble.reactions, input.reaction) }
        : bubble,
    );
  } else {
    soothes = soothes.map((soothe) =>
      soothe.id === input.target.id
        ? { ...soothe, reactions: bump(soothe.reactions, input.reaction) }
        : soothe,
    );
  }
  return { ok: true };
}

function currentMine(input: AddReactionInput): number {
  const state =
    input.target.type === "bubble"
      ? bubbles.find((b) => b.id === input.target.id)?.reactions
      : soothes.find((s) => s.id === input.target.id)?.reactions;
  return state?.mine[input.reaction] ?? 0;
}

function isOwnTarget(target: AddReactionInput["target"]): boolean {
  if (target.type === "bubble") {
    return bubbles.find((bubble) => bubble.id === target.id)?.isMine ?? false;
  }
  return soothes.find((soothe) => soothe.id === target.id)?.isMine ?? false;
}

function bump(state: ReactionState, reaction: ReactionType): ReactionState {
  return {
    counts: { ...state.counts, [reaction]: (state.counts[reaction] ?? 0) + 1 },
    mine: { ...state.mine, [reaction]: (state.mine[reaction] ?? 0) + 1 },
  };
}

/** FR-POST-006/007：自分のバブルだけ削除できる。不可逆 */
export async function deleteBubble(bubbleId: string): Promise<{ readonly ok: boolean }> {
  await sleep(MOCK_LATENCY_MS);
  const target = bubbles.find((bubble) => bubble.id === bubbleId);
  if (!target || !target.isMine) {
    return { ok: false };
  }
  bubbles = bubbles.filter((bubble) => bubble.id !== bubbleId);
  soothes = soothes.filter((soothe) => soothe.bubbleId !== bubbleId);
  return { ok: true };
}

/** バブルを開いたことを覚えておく（S2 の未読／押下済の出しわけ用） */
export function markRead(bubbleId: string): void {
  bubbles = bubbles.map((bubble) => (bubble.id === bubbleId ? { ...bubble, read: true } : bubble));
}

/*
 * ────────────── S6 他人の公開プロフィール ──────────────
 *
 * 入口はペルソナ id ひとつだけ。ここから もう一方のペルソナへ辿る道を作らない
 * （FR-PERSONA-004）。返す形にも、辿るための材料を置かない。
 */

/**
 * S6 公開プロフィール（GET /api/personas/:id 相当、FR-PROFILE-005）。
 *
 * 返していないもの：生年月日、フォロー中の数と中身、フォロワーに関する一切、
 * もう一方のペルソナ。どれも「画面で出さない」ではなく「応答に含めない」で落とす。
 */
export async function fetchPublicProfile(personaId: string): Promise<PublicProfile | null> {
  const persona = PERSONA_BY_ID[personaId];
  if (!persona) {
    return null;
  }
  const status = await statusOf(textsFor(persona.id, persona.kind), persona.kind);
  return {
    persona,
    status,
    liked: following.has(persona.id),
    isMe: persona.id === ME.baby.id || persona.id === ME.mother.id,
  };
}

/** S6 の一覧。S8 と同じ組み立てを通す */
export async function fetchPublicActivity(
  personaId: string,
  tab: ActivityTab,
): Promise<readonly ActivityEntry[]> {
  await sleep(MOCK_LATENCY_MS);
  return activityOf(personaId, tab);
}

export type SetLikedResult = { readonly ok: boolean; readonly liked: boolean };

/**
 * 「大好き」の付け外し（＝フォロー。FR-FOLLOW-001/002）。
 *
 * ペルソナ単位で、一方向。相手の承認は要らない。
 * 自分のペルソナには付けられない（画面にもボタンを出さないが、ここでも弾く）。
 *
 * ★ 相手側から「誰に大好きされたか」を引ける口は作らない（FR-FOLLOW-004、OUT-004）。
 *   この関数が書き換えるのは、閲覧者本人の following だけ。
 */
export async function setLiked(personaId: string, liked: boolean): Promise<SetLikedResult> {
  await sleep(MOCK_LATENCY_MS);
  if (personaId === ME.baby.id || personaId === ME.mother.id) {
    return { ok: false, liked: false };
  }
  if (!PERSONA_BY_ID[personaId]) {
    return { ok: false, liked: false };
  }
  if (liked) {
    following.add(personaId);
  } else {
    following.delete(personaId);
  }
  return { ok: true, liked: following.has(personaId) };
}

/**
 * S7 大好きな人の一覧（GET /api/profile/me/following 相当、FR-FOLLOW-003）。
 *
 * ★ 本人だけが引ける。「誰が自分を大好きにしているか」を返す口は、この先も作らない
 *   （FR-FOLLOW-004/005、OUT-004）。
 *
 * 赤ちゃんとお母さんを別々の配列で返す。1つに混ぜると、画面側が
 * 種類ごとに出し分けるために毎回 kind を見ることになる。
 */
export async function fetchLikedPersonas(): Promise<{
  readonly baby: readonly PublicPersona[];
  readonly mother: readonly PublicPersona[];
}> {
  await sleep(MOCK_LATENCY_MS);
  const liked: PublicPersona[] = [];
  for (const id of following) {
    const persona = PERSONA_BY_ID[id];
    if (persona) {
      liked.push(persona);
    }
  }
  return {
    baby: liked.filter((persona) => persona.kind === "baby"),
    mother: liked.filter((persona) => persona.kind === "mother"),
  };
}

/*
 * ────────────── S1 アカウント登録 ──────────────
 *
 * ★ 認証・アカウント登録の仕様は未確定（Issue #7、status:needs-human）。
 *   ここにある規則は、画面を動かすための仮置きで、正しさの根拠になるものではない。
 *   本物の判定はすべて backend の担当（FR-MOD-004 と同じ立場）。
 *   決まったら、この節と SignUpScreen の説明文をいっしょに直す。
 */

/** すでに使われている アカウントID（重複不可）。仮置きのダミー */
const TAKEN_ACCOUNT_IDS: ReadonlySet<string> = new Set(["engiiro", "admin", "yowane", "test"]);

/** 仮置き：半角の英小文字・数字・アンダースコアで 3〜20 文字 */
const ACCOUNT_ID_PATTERN = /^[a-z0-9_]{3,20}$/;

/** 仮置き：8 文字以上 */
export const PASSWORD_MIN_LENGTH = 8;

/** ニックネームの上限。仕様に無いので仮置き */
export const NICKNAME_MAX_LENGTH = 20;

export const ACCOUNT_ID_RULE_TEXT = "半角の 英小文字・数字・_ で 3〜20 文字";

/**
 * アカウントを作る（POST /api/accounts 相当）。
 *
 * FR-ACCOUNT-001：1回の登録で赤ちゃんとお母さんの2ペルソナが同時にできる。
 * FR-ACCOUNT-002：ニックネームはそれぞれ設定できる。
 * FR-ACCOUNT-003：認証情報は内部情報。戻り値に password を含めない。
 *
 * ★ ニックネームにもモデレーションをかけている（この判断は私のもの。要確認）。
 *   仕様書 FR-MOD-001〜003 は「本文」を対象と書いていて、ニックネームには触れていない。
 *   ただ、ニックネームは公開プロフィールに常に出るので、そこに電話番号や
 *   外部アカウント名が入ると、本文を守っている意味がなくなる（FR-MOD-010 の趣旨）。
 *
 * ★ 2つのニックネームが完全に同じときも作らない（この判断も私のもの。要確認）。
 *   同じ名前が両方に出ると、それだけで同一人物の手がかりになる（FR-PERSONA-003）。
 */
export async function createAccount(input: CreateAccountInput): Promise<CreateAccountResult> {
  await sleep(MOCK_LATENCY_MS);

  const accountId = input.accountId.trim();
  if (!ACCOUNT_ID_PATTERN.test(accountId)) {
    return { ok: false, reason: "account_id_invalid" };
  }
  if (TAKEN_ACCOUNT_IDS.has(accountId)) {
    return { ok: false, reason: "account_id_taken" };
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
  if (moderate(baby) === "violation" || moderate(mother) === "violation") {
    return { ok: false, reason: "nickname_moderation" };
  }

  /*
   * モックなので、閲覧者自身のペルソナの名前だけを差し替える。
   * ペルソナ id は変えない。すでにあるバブル・あやすの表示名も合わせる。
   * password はここで捨てる。どこにも持たない（FR-ACCOUNT-003）。
   */
  const next: Me = {
    baby: { ...ME.baby, nickname: baby },
    mother: { ...ME.mother, nickname: mother },
  };
  setMe(next);
  PERSONA_BY_ID[next.baby.id] = next.baby;
  PERSONA_BY_ID[next.mother.id] = next.mother;
  bubbles = bubbles.map((bubble) =>
    bubble.author.id === next.baby.id ? { ...bubble, author: next.baby } : bubble,
  );
  soothes = soothes.map((soothe) => {
    if (soothe.author.id === next.baby.id) {
      return { ...soothe, author: next.baby };
    }
    return soothe.author.id === next.mother.id ? { ...soothe, author: next.mother } : soothe;
  });
  return { ok: true, me: next };
}

export type LoginResult =
  | { readonly ok: true; readonly me: Me }
  | { readonly ok: false; readonly reason: "invalid" };

/**
 * ログイン（POST /api/sessions 相当）。
 *
 * ★ 仮置き。ID とパスワードの形だけを見て通している（Issue #7、status:needs-human）。
 *   本物は backend の担当で、失敗の理由を細かく返さないのは変わらない。
 *   「ID が無い」と「パスワードが違う」を区別して返すと、
 *   どの ID が存在するかを外から数えられる。
 */
export async function login(accountId: string, password: string): Promise<LoginResult> {
  await sleep(MOCK_LATENCY_MS);
  if (!ACCOUNT_ID_PATTERN.test(accountId.trim()) || password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true, me: ME };
}

/** ログアウト（DELETE /api/sessions 相当）。モックでは持っている状態が無いので何もしない */
export async function logout(): Promise<void> {
  await sleep(MOCK_LATENCY_MS);
}
