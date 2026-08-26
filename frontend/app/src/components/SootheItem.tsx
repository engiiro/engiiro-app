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
 *
 * ★ 本文を押すと、そのあやすの詳細が開く（人間の指示、2026-08-26）。
 *   当たり判定の作りはバブルカードと同じ：擬似要素を1件の全面に敷き、
 *   手前に出したい操作（ニックネーム・リアクション・あやす）だけ z-index で上げる。
 *   バブルと同じ触り心地にするのが目的なので、ここだけ別の作法にしない。
 */

type SootheItemProps = {
  readonly soothe: Soothe;
  readonly replyToNickname?: string;
  /** ニックネームから S6 公開プロフィールへ */
  readonly onOpenProfile: (personaId: string) => void;
  readonly onReact: (sootheId: string, reaction: ReactionType) => void;
  readonly onReply: (soothe: Soothe) => void;
  /** 本文を押したとき。あやす詳細（誰があやしているかの一覧）へ */
  readonly onOpen: (soothe: Soothe) => void;
};

export function SootheItem({
  soothe,
  replyToNickname,
  onOpenProfile,
  onReact,
  onReply,
  onOpen,
}: SootheItemProps) {
  return (
    <li className={cx("eg-soothe", "is-" + soothe.author.kind)}>
      <div className="eg-soothe__head">
        <PersonaChip
          persona={soothe.author}
          createdAt={soothe.createdAt}
          compact
          onOpenProfile={onOpenProfile}
        />
      </div>

      {replyToNickname ? (
        <p className={cx("eg-soothe__quote", "t-caption")}>{replyToNickname} へ</p>
      ) : null}

      {/* 1件のなかで focus できる主役はこの1つ。中身は phrasing content だけにしてある */}
      <button type="button" className="eg-soothe__open" onClick={() => onOpen(soothe)}>
        <BubbleBody body={soothe.body} className="eg-soothe__body" as="span" />
        <span className={cx("eg-soothe__count", "t-caption")}>
          {soothe.replyCount > 0
            ? "あやす " + String(soothe.replyCount)
            : "まだ あやされてない"}
        </span>
      </button>

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
          あやす
        </button>
      </div>
    </li>
  );
}
