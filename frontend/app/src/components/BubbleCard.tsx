import type { Bubble, ReactionType } from "../data/types";
import { cx } from "../lib/cx";
import { PersonaChip } from "./PersonaChip";
import { ReactionRow } from "./ReactionRow";
import "./BubbleCard.css";

/*
 * バブルカード（DESIGN.md §4 Cards）。
 *
 * 視線は ニックネーム → 本文 → リアクション の順。
 * 影は付けない。ホバーで浮かせない。フィードは読み物であってボタンの列ではない。
 *
 * 本文の URL を自動リンク化しない（FR-MOD-021 / OUT-008）。そもそも保存されないので、
 * リンク化の処理そのものを置かない。本文はただのテキストとして出す。
 *
 * 未読／押下済は色だけでなく文字でも区別する（DESIGN.md §2.5）。
 */

type BubbleCardProps = {
  readonly bubble: Bubble;
  readonly onOpen: (bubbleId: string) => void;
  readonly onToggleReaction: (bubbleId: string, reaction: ReactionType) => void;
};

export function BubbleCard({ bubble, onOpen, onToggleReaction }: BubbleCardProps) {
  return (
    <article className={cx("eg-card", bubble.read && "is-read")}>
      <header className="eg-card__head">
        <PersonaChip persona={bubble.author} createdAt={bubble.createdAt} showRole={false} />
        <span className={cx("eg-card__state", "t-label")}>
          {bubble.read ? (
            <span className="eg-card__read">よんだ</span>
          ) : (
            <>
              <span className="eg-card__dot" aria-hidden="true" />
              まだ
            </>
          )}
        </span>
      </header>

      {/* カード内で focus できる主役はこの1つ。中身は phrasing content だけにしてある */}
      <button type="button" className="eg-card__open" onClick={() => onOpen(bubble.id)}>
        <span className={cx("eg-card__body", "t-bubble-body", "eg-prose")}>{bubble.body}</span>
        {/* タグとあやす件数は同じ行に置く。1行ぶんの高さがカード2.5枚の密度に効く */}
        <span className="eg-card__meta">
          <span className="eg-card__tags">
            {bubble.tags.map((tag) => (
              <span key={tag} className={cx("eg-tag", "t-label")}>
                {tag}
              </span>
            ))}
          </span>
          <span className={cx("eg-card__more", "t-caption")}>
            {bubble.sootheCount > 0 ? "あやす " + String(bubble.sootheCount) : "まだ あやされてない"}
          </span>
        </span>
      </button>

      <footer className="eg-card__foot">
        <ReactionRow
          targetKind="bubble"
          state={bubble.reactions}
          onToggle={(reaction) => onToggleReaction(bubble.id, reaction)}
        />
      </footer>
    </article>
  );
}
