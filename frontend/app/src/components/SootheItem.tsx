import { reactionTargetOfSoothe } from "../data/reactions";
import type { ReactionType, Soothe } from "../data/types";
import { cx } from "../lib/cx";
import { BubbleBody } from "./BubbleBody";
import { PersonaChip } from "./PersonaChip";
import { ReactionRow } from "./ReactionRow";
import "./SootheItem.css";

/*
 * あやす1件（DESIGN.md §0.2）。
 *
 * ★ リアクション行の中身は、あやすの発信ペルソナだけで決まる：
 *     赤ちゃんとしてのあやす → おぎゃー・よしよし・まんま の3種
 *     お母さんとしてのあやす → ばぶー の1種のみ
 *   ここで種類を選び直さない。reactionTargetOfSoothe に渡すだけ。
 *
 * 発信者から、同一アカウントのもう一方のペルソナを特定できる情報を出さない（FR-COMMENT-004）。
 */

type SootheItemProps = {
  readonly soothe: Soothe;
  readonly replyToNickname?: string;
  readonly onReact: (sootheId: string, reaction: ReactionType) => void;
  readonly onReply: (soothe: Soothe) => void;
};

export function SootheItem({
  soothe,
  replyToNickname,
  onReact,
  onReply,
}: SootheItemProps) {
  return (
    <li className={cx("eg-soothe", "is-" + soothe.author.kind)}>
      <PersonaChip persona={soothe.author} createdAt={soothe.createdAt} compact />

      {replyToNickname ? (
        <p className={cx("eg-soothe__quote", "t-caption")}>{replyToNickname} へ</p>
      ) : null}

      <BubbleBody body={soothe.body} className="eg-soothe__body" />

      <div className="eg-soothe__foot">
        <ReactionRow
          targetKind={reactionTargetOfSoothe(soothe.author.kind)}
          state={soothe.reactions}
          onReact={(reaction) => onReact(soothe.id, reaction)}
          compact
          readOnly={soothe.isMine}
        />
        <button
          type="button"
          className={cx("eg-soothe__reply", "t-label", "eg-touch")}
          onClick={() => onReply(soothe)}
        >
          返信する
        </button>
      </div>
    </li>
  );
}
