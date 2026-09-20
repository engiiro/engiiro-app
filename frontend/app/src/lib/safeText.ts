/*
 * 表示に混ぜる前の文字列の無害化（frontend 完結、2026-09-05）。
 *
 * ここで消すのは「読めない／読み手をだます」文字だけ。
 *   - 制御文字（C0/C1）… 表示できないのに幅や高さに効いて、行がずれる
 *   - 双方向の上書き（U+202A〜202E、U+2066〜2069）… 表示だけを逆向きにできる。
 *     ニックネームに1文字混ぜるだけで、画面上の並びを実際と違う順に見せられる
 *   - 幅ゼロ（U+200B、U+200E/200F、U+FEFF）… 見えない文字で、同じに見える別の名前を作れる
 *
 * ★ U+200C/200D（ZWNJ / ZWJ）は消さない。絵文字の合字（👨‍👩‍👧 や 🏳️‍🌈）や、
 *   アラビア文字・インド系文字の表記に要る文字なので、幅ゼロだからと落とすと
 *   家族の絵文字が ばらばらの人に割れる（2026-09-05 の確認で発生）。
 * ★ 改行（\n）とタブ（\t）は残す。本文は white-space: pre-wrap で出しているので
 *   （tokens/base.css）、ここで改行を落とすと書いたとおりに出なくなる。
 * ★ HTML の除去はしない。React が文字として出すので、タグは元から効かない
 *   （dangerouslySetInnerHTML はこのアプリのどこにも無い。増やさない）。
 * ★ 長すぎる文字列を切る役はここではない。入力側の天井は lib/floodGuard.ts、
 *   途中で折る役は CSS（overflow-wrap: anywhere）が持っている。
 */

const UNSAFE_CHARS =
  // 消すための表なので、制御文字がここに並ぶのは意図どおり
  // oxlint-disable-next-line no-control-regex
  /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/** 制御文字・双方向の上書き・幅ゼロを落とす。改行とタブは残す */
export function safeText(value: string): string {
  return value.replace(UNSAFE_CHARS, "");
}

/**
 * 入れ子の深さの上限。これより深いところは触らずそのまま返す。
 * 深さが数万段の JSON を渡されても、ここを歩いて stack を使い切らないため。
 */
const MAX_DEPTH = 24;

/**
 * 受け取ったデータの中の文字列を、まとめて無害化する。
 *
 * ★ 画面ごとに掛け忘れないよう、fetch の出口（data/apiClient.ts）で一度だけ通す。
 *   id やトークンも通るが、消すのは制御文字だけなので、まともな値は変わらない。
 */
export function safeJson<T>(value: T): T {
  return walk(value, 0) as T;
}

function walk(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) {
    return value;
  }
  if (typeof value === "string") {
    return safeText(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => walk(item, depth + 1));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = walk(item, depth + 1);
    }
    return out;
  }
  return value;
}
