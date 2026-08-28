import { REPLY_WORDING } from "./replyWording";
import type { ReplyKind } from "./replyWording";

/**
 * 何件ついたかの一行。
 *
 * バブルなら直接ついたあやすの数、あやすならそれへ返ってきたものの数。
 *
 * ★ 0 のときも空欄にしない。「まだ あやされてない」と書く（DESIGN.md §4 Cards）。
 *   数字の 0 を突きつけるかわりに、まだ誰も来ていないことを言葉で書く。
 * ★ フィードのカード・あやす1件・プロフィールの一覧の3か所が同じ文を出す。
 *   別々に書いていたので、片方だけ言い回しが変わる形になっていた。
 * ★ ことばは返信先で変わる（人間の決定 2026-08-28）。お母さんのあやすへ返るのは
 *   赤ちゃんのバブルなので「バブル 3」。それ以外は「あやす 3」。表は
 *   lib/replyWording.ts が持っていて、ここは引くだけ。
 */
export function sootheCountText(count: number, kind: ReplyKind = "soothe"): string {
  const wording = REPLY_WORDING[kind];
  return count > 0 ? wording.countNoun + " " + String(count) : wording.noneText;
}
