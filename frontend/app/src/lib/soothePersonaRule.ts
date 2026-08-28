import type { PersonaKind } from "../data/types";

/*
 * S5（あやすモーダル）で、ペルソナ選択に何を出すかの規則。
 *
 * 返信先によって選択肢そのものが変わる。S3（バブル作成）とは扱いが違う：
 *   S3 … お母さんを disabled にして残し、ラベルに理由を書く（投稿は常に赤ちゃんという
 *         仕様を、隠して誤解させないため。DESIGN.md §0.3）
 *   S5 … お母さんを「選択肢に出さない」。FR-COMMENT-005 の受入条件が
 *         「お母さんが選択肢に現れず、赤ちゃんのみが選択できる」なので、disabled では足りない
 */

export type SootheTarget =
  | {
      readonly kind: "bubble";
      readonly bubbleId: string;
      readonly authorNickname: string;
      readonly bubbleIsMine: boolean;
    }
  | {
      readonly kind: "soothe";
      readonly bubbleId: string;
      readonly sootheId: string;
      readonly authorKind: PersonaKind;
      readonly authorNickname: string;
      readonly bubbleIsMine: boolean;
    };

export type PersonaChoiceRule = {
  readonly allowed: readonly PersonaKind[];
  /** 選択肢が減っている理由。画面に1行で出す */
  readonly reason?: string;
};

export function soothePersonaRule(target: SootheTarget): PersonaChoiceRule {
  // FR-COMMENT-005/006：お母さんとしてのあやすを返信先とする場合、選べるのは赤ちゃんだけ
  if (target.kind === "soothe" && target.authorKind === "mother") {
    return {
      allowed: ["baby"],
      reason: "お母さんへのあやすには、赤ちゃんとしてだけ 返せます。",
    };
  }

  /*
   * 自分のバブルの画面では赤ちゃんだけにしている。
   *
   * 理由は DESIGN.md §0.1-1「同じ画面に自分の両ペルソナを並べない」。
   * 自分のバブル（発信者＝自分の赤ちゃん）に自分のお母さんであやすと、1画面に
   * 自分の2つのニックネームが並ぶ。
   *
   * ただしこれは仕様書に書かれた制約ではなく、DESIGN.md の原則から導いた UI 側の判断。
   * 人間の確認が必要な点として PR に挙げてある。
   */
  if (target.bubbleIsMine) {
    return {
      allowed: ["baby"],
      reason: "自分のバブルには、赤ちゃんとして あやします。",
    };
  }

  return { allowed: ["baby", "mother"] };
}
