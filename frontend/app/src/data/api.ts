import { mockAiEvaluate } from "../lib/mockAiEvaluate";
import { AiUnavailableError } from "../lib/mockAiTransform";
import { moderate } from "../lib/mockModeration";
import { BUBBLE_MAX_LENGTH, REACTION_MAX_PER_USER, countChars } from "./constants";
import { BUBBLE_SEEDS } from "./bubbles";
import { ME } from "./personas";
import { isReactionAllowed } from "./reactions";
import { SOOTHE_SEEDS } from "./soothes";
import { STAMP_CATALOG } from "./stamps";
import type {
  Bubble,
  BubbleDetail,
  CreateBubbleInput,
  CreateSootheInput,
  Me,
  PersonaKind,
  PublicPersona,
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
 *   fetchMe            → GET  /api/profile/me
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
  isMine: false,
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
    recommended: band.map((entry) => entry.bubble),
    rest: scored.filter((entry) => !bandIds.has(entry.bubble.id)).map((entry) => entry.bubble),
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
    bubble,
    soothes: soothes.filter((item) => item.bubbleId === bubbleId),
  };
}

/** 本人専用。両ペルソナをまとめて返すのはこの口だけ（FR-PERSONA-005） */
export async function fetchMe(): Promise<Me> {
  return ME;
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
