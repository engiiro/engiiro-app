import { BABY_PERSONAS, ME } from "./personas";
import type { PublicPersona, ReactionState } from "./types";

/*
 * 静的ダミーのバブル。
 *
 * 本文そのものが仕様を満たすようにしてある：
 *   - 実名・所属・勤務先の具体名を書かない（FR-MOD-012/013/020）
 *   - 電話番号・メール・外部サービスのID・URL を書かない（FR-MOD-014/015/021）
 *   - 待ち合わせ・現実で会う話を書かない（FR-MOD-018）
 *   - 「会社で疲れた」程度の抽象表現は書いてよい（FR-MOD-022）
 *
 * 時刻は絶対値で持たない。「何分前か」だけを持ち、data/api.ts で ISO に変換する。
 * 画面に絶対時刻を出さないため（DESIGN.md §0.1-5）。
 */

export type BubbleSeed = {
  readonly id: string;
  readonly author: PublicPersona;
  readonly body: string;
  readonly minutesAgo: number;
  readonly reactions: ReactionState;
  readonly isMine: boolean;
  readonly read: boolean;
  /** 閲覧者の赤ちゃんペルソナとの近さ。AI 文章評価の結果の代わり（FR-FEED-003 / FR-AI-EVAL-007） */
  readonly affinity: number;
  readonly sootheCount: number;
};

export const BUBBLE_SEEDS: readonly BubbleSeed[] = [
  {
    id: "bubble_01",
    author: BABY_PERSONAS.sheep,
    body: "レビューのコメントが 30こ ついてた。ぜんぶ ただしいのが つらい。ぼく、まだ ちゃんと できてないのが ばれちゃう。",
    minutesAgo: 22,
    reactions: { counts: { ogya: 12, yoshiyoshi: 31, manma: 48 }, mine: {} },
    isMine: false,
    read: false,
    affinity: 0.94,
    sootheCount: 4,
  },
  {
    id: "bubble_02",
    author: BABY_PERSONAS.taputapu,
    body: "きょうも 会議で なにも 手が うごかなかった。ごはん たべるの わすれてて、きづいたら まっくらだった。",
    minutesAgo: 58,
    reactions: { counts: { ogya: 3, yoshiyoshi: 9, manma: 21 }, mine: { yoshiyoshi: 2 } },
    isMine: false,
    read: false,
    affinity: 0.88,
    sootheCount: 1,
  },
  {
    id: "bubble_03",
    author: BABY_PERSONAS.babubabu,
    body: "ぼくの かいた コードが うごかない。うごかない りゆうも わからない。ねむい。",
    minutesAgo: 7,
    reactions: { counts: { ogya: 6, yoshiyoshi: 4, manma: 11 }, mine: {} },
    isMine: false,
    read: false,
    affinity: 0.41,
    sootheCount: 1,
  },
  {
    id: "bubble_04",
    author: ME.baby,
    body: "だれにも いえないけど、もう ぜんぶ なげだして ねてしまいたい。あしたも あるのに。",
    minutesAgo: 96,
    reactions: { counts: { ogya: 2, yoshiyoshi: 14, manma: 7 }, mine: {} },
    isMine: true,
    read: true,
    affinity: 1,
    sootheCount: 2,
  },
  {
    id: "bubble_05",
    author: BABY_PERSONAS.mikan,
    body: "リリースの まえの日は いつも おなかが いたくなる。だいじょうぶって いわれるほど こわい。",
    minutesAgo: 143,
    reactions: { counts: { ogya: 8, yoshiyoshi: 17, manma: 26 }, mine: {} },
    isMine: false,
    read: false,
    affinity: 0.79,
    sootheCount: 1,
  },
  {
    id: "bubble_06",
    author: BABY_PERSONAS.yowane,
    body: "わからないって いうのが こわくて、わかったふりを した。ぜんぶ ぼくの せいだ。",
    minutesAgo: 310,
    reactions: { counts: { ogya: 15, yoshiyoshi: 22, manma: 39 }, mine: { manma: 5 } },
    isMine: false,
    read: true,
    affinity: 0.86,
    sootheCount: 0,
  },
  {
    id: "bubble_07",
    author: BABY_PERSONAS.puni,
    body: "ひとりで かかえてるの、なれちゃった。なれたって いいことじゃ ないよね。",
    minutesAgo: 512,
    reactions: { counts: { ogya: 1, yoshiyoshi: 5, manma: 12 }, mine: {} },
    isMine: false,
    read: true,
    affinity: 0.35,
    sootheCount: 1,
  },
];
