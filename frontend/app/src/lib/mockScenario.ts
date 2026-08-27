import { THEME_CHOICES } from "./useTheme";
import type { ThemeChoice } from "./useTheme";

/*
 * モックの見え方を URL で指定する（人間の決定、2026-08-28）。
 *
 * 以前は画面の上に「モック操作」帯を置いていた。製品の UI ではないものが
 * 常に画面の一番上を占めていて、実機の縦幅も食っていたので、URL に退避した。
 *
 * ここで切り替えるのは、**画面の操作だけでは作れない状態**だけ：
 *   ?feed=empty|loading           … フィードが空／読み込み中
 *   ?ai-eval=off                  … AI 文章評価が停止（NFR-003：投稿できない）
 *   ?ai-transform=off             … AI 文章生成が停止（NFR-001：投稿は続けられる）
 *   ?entry=intro|signup|login|app … 入り口の画面
 *   ?theme=normal|dark|kid|system … テーマを1回だけ選び直す
 *
 * ★ 実 API に差し替えるときに、このファイルごと消える。
 *   AI の生死もフィードの中身も、本物ではサーバの状態で決まる。
 * ★ window を見ない。文字列を受け取って解釈するだけにして、呼ぶ側から渡す。
 * ★ 知らない値・書かれていない値は既定に落とす。URL は未検証の入力なので、
 *   ここを通ったものしか App の state には入らない。
 */

/** フィードの見え方。normal 以外はモック専用の状態 */
export type FeedMode = "normal" | "loading" | "empty";

/**
 * 画面の入り口。
 *   intro  … 登録の前に読む説明
 *   signup … S1 アカウント登録
 *   login  … ログイン
 *   app    … 本編（ゲストでもここに入れる）
 *
 * 本物では未登録なら intro から始まり、登録が済めば app にしか入らない
 * （認証は Issue #7 で未確定）。この型は entry の状態そのものなので、
 * ログイン導線（RightRail / LoginPrompt）からも使う。
 */
export type EntryStage = "intro" | "signup" | "login" | "app";

export type MockScenario = {
  readonly feed: FeedMode;
  readonly entry: EntryStage;
  /** AI 文章評価が動いているか。落ちていると投稿できない（NFR-003） */
  readonly aiEvaluate: boolean;
  /** AI 文章生成が動いているか。落ちていても投稿は続けられる（NFR-001） */
  readonly aiTransform: boolean;
  /** URL でテーマを指定されたときだけ入る。無指定なら null（＝保存された選択のまま） */
  readonly theme: ThemeChoice | null;
};

const DEFAULT_SCENARIO: MockScenario = {
  feed: "normal",
  entry: "app",
  aiEvaluate: true,
  aiTransform: true,
  theme: null,
};

const FEED_MODES: readonly FeedMode[] = ["normal", "loading", "empty"];
const ENTRY_STAGES: readonly EntryStage[] = ["intro", "signup", "login", "app"];

function pick<T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: T,
): T {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** `off` / `false` / `0` を「止まっている」と読む。それ以外は動いている扱い */
function isOff(value: string | null): boolean {
  return value === "off" || value === "false" || value === "0";
}

/**
 * URL のクエリ文字列から、モックの見え方を読む。
 * 呼ぶ側が `window.location.search` を渡す（この関数は window を見ない）。
 */
export function readMockScenario(search: string): MockScenario {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return DEFAULT_SCENARIO;
  }

  return {
    feed: pick(params.get("feed"), FEED_MODES, DEFAULT_SCENARIO.feed),
    entry: pick(params.get("entry"), ENTRY_STAGES, DEFAULT_SCENARIO.entry),
    aiEvaluate: !isOff(params.get("ai-eval")),
    aiTransform: !isOff(params.get("ai-transform")),
    theme: params.has("theme")
      ? pick(params.get("theme"), THEME_CHOICES, "system")
      : null,
  };
}
