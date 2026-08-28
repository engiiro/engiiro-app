import type { PersonaKind } from "../data/types";

/*
 * 「返す」操作の呼び名（人間の決定、2026-08-28）。
 *
 * ── 直した症状 ────────────────────────────────────────────────────
 * 「お母さんの返信を受ける操作」と「その返信に赤ちゃんとして返す操作」の
 * 両方が「あやす」と出ていた。後者は赤ちゃんしか選べない場面（FR-COMMENT-005）で、
 * 赤ちゃんが誰かを「あやす」わけではないので、操作の主体と言葉が合っていなかった。
 *
 * ── 決めた対応 ────────────────────────────────────────────────────
 * 返信先によって呼び名を2つに分ける。
 *
 *   返信先                    選べる顔            呼び名
 *   ────────────────────────────────────────────────
 *   バブル                    赤ちゃん / お母さん   あやす
 *   赤ちゃんとしてのあやす     赤ちゃん / お母さん   あやす
 *   お母さんとしてのあやす     赤ちゃんのみ         バブる
 *
 * お母さんのあやすへ返せるのは赤ちゃんだけで、そこで出てくることばは
 * 受け止めではなく弱音そのもの。だから「バブる」（人間の決定 2026-08-28）。
 *
 * ★ ここは表示の正本。内部の関数名・API・型（createSoothe / POST /api/posts/:id/comments /
 *   Soothe）は変えていない。保存されるものは今までどおり「あやす（コメント）」1種類で、
 *   分かれているのは画面のことばだけ。
 * ★ 画面ごとに文を書かない。ボタン・見出し・件数・空状態・トーストが
 *   同じ表からことばを引く（別々に書くと、片方だけ言い回しが変わる）。
 */

/** 返す操作の種類。表示のことばはこれだけで決まる */
export type ReplyKind = "soothe" | "bubble";

/** 返信先のあやすの発信ペルソナから、返す側の呼び名を決める */
export function replyKindOfSoothe(authorKind: PersonaKind): ReplyKind {
  return authorKind === "mother" ? "bubble" : "soothe";
}

export type ReplyWording = {
  /** ボタンの文字。押すとその操作が始まる */
  readonly action: string;
  /** 書く画面（ComposePanel）の見出し */
  readonly title: string;
  /** 送信ボタンの文字 */
  readonly send: string;
  /** 送ったあとのトースト */
  readonly done: string;
  /** 件数の頭に付ける名詞。「あやす 3」「バブル 3」 */
  readonly countNoun: string;
  /** 1件も無いときの一行 */
  readonly noneText: string;
  /** 一覧が空のときの空状態（2行） */
  readonly emptyLines: readonly [string, string];
  /** 「この あやすへの ○○」の見出し */
  readonly listTitle: string;
};

export const REPLY_WORDING: Readonly<Record<ReplyKind, ReplyWording>> = {
  soothe: {
    action: "あやす",
    title: "あやす",
    send: "あやす",
    done: "あやしました",
    countNoun: "あやす",
    noneText: "まだ あやされてない",
    emptyLines: ["まだ だれも あやしていません。", "さいしょの ひとりに なってみる？"],
    listTitle: "この あやすに あやしている人",
  },
  bubble: {
    action: "バブる",
    /* 見出しはタイムラインから書くときと同じにする。書いているものが同じだから */
    title: "バブルを かく",
    send: "バブる",
    done: "ぽいっと できました",
    countNoun: "バブル",
    noneText: "まだ バブルは ないよ",
    emptyLines: ["まだ だれも バブっていません。", "さいしょの ひとりに なってみる？"],
    listTitle: "この あやすへの バブル",
  },
};
