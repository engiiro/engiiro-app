import { BABY_PERSONAS, MOTHER_PERSONAS } from "./personas";
import type { PublicPersona, ReactionState } from "./types";

/*
 * 静的ダミーのあやす。赤ちゃんとしてのものと、お母さんとしてのものを両方含む。
 *
 * リアクションの中身が対象で変わるのを見るためのデータ：
 *   赤ちゃんとしてのあやす → おぎゃー／よしよし／わかるわぁ
 *   お母さんとしてのあやす → ばぶー だけ（counts に他の種類を持たせない。FR-REACT-005/006）
 *
 * bubble_04 は閲覧者自身のバブルなので、あやすの発信者に閲覧者自身の
 * お母さんペルソナを置かない（同じ画面に自分の両ペルソナが並ぶのを避ける。DESIGN.md §0.1-1）。
 */

export type SootheSeed = {
  readonly id: string;
  readonly bubbleId: string;
  readonly author: PublicPersona;
  readonly body: string;
  readonly minutesAgo: number;
  readonly reactions: ReactionState;
  readonly replyToSootheId?: string;
};

export const SOOTHE_SEEDS: readonly SootheSeed[] = [
  {
    id: "soothe_01",
    bubbleId: "bubble_01",
    author: BABY_PERSONAS.taputapu,
    body: "わかるよぉ。ぼくも きのう おなじだった。30こは おおすぎるよぉ。",
    minutesAgo: 18,
    reactions: { counts: { ogya: 2, yoshiyoshi: 5, wakaruwa: 9 }, mine: {} },
  },
  {
    id: "soothe_02",
    bubbleId: "bubble_01",
    author: MOTHER_PERSONAS.okan,
    body: "よしよし。30こ ぜんぶ 直さなくて いいんだよ。ひとつ 直せたら、それで じゅうぶん えらい。",
    minutesAgo: 14,
    reactions: { counts: { babu: 23 }, mine: {} },
  },
  {
    id: "soothe_03",
    bubbleId: "bubble_01",
    author: BABY_PERSONAS.yowane,
    body: "ばれても だいじょうぶ。ぼくも ばれてるもん。",
    minutesAgo: 9,
    reactions: { counts: { ogya: 1, yoshiyoshi: 3, wakaruwa: 4 }, mine: { wakaruwa: 5 } },
    replyToSootheId: "soothe_02",
  },
  {
    id: "soothe_04",
    bubbleId: "bubble_01",
    author: MOTHER_PERSONAS.manmaru,
    body: "ちゃんと できてないんじゃなくて、ちゃんと やろうとしてるんだよ。きょうは もう ねようね。",
    minutesAgo: 4,
    reactions: { counts: { babu: 7 }, mine: { babu: 3 } },
  },
  {
    id: "soothe_05",
    bubbleId: "bubble_04",
    author: MOTHER_PERSONAS.yoshiyoshi,
    body: "なげだして ねて いいよ。あしたの ぶんは、あしたの あなたが なんとかするから。",
    minutesAgo: 71,
    reactions: { counts: { babu: 11 }, mine: {} },
  },
  {
    id: "soothe_06",
    bubbleId: "bubble_04",
    author: BABY_PERSONAS.babubabu,
    body: "ぼくも おなじ。いっしょに ねよ。",
    minutesAgo: 63,
    reactions: { counts: { ogya: 4, yoshiyoshi: 2, wakaruwa: 6 }, mine: {} },
  },
  {
    id: "soothe_07",
    bubbleId: "bubble_02",
    author: BABY_PERSONAS.puni,
    body: "ごはん たべて…！ ぼくも わすれる。",
    minutesAgo: 40,
    reactions: { counts: { ogya: 0, yoshiyoshi: 1, wakaruwa: 3 }, mine: {} },
  },
];
