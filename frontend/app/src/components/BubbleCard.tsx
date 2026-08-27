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
  /** ニックネームから S6 公開プロフィールへ */
  readonly onOpenProfile: (personaId: string) => void;
  readonly onReact: (bubbleId: string, reaction: ReactionType) => void;
};

export function BubbleCard({ bubble, onOpen, onOpenProfile, onReact }: BubbleCardProps) {
  return (
    <article className={cx("eg-card", bubble.read && "is-read")}>
      <header className="eg-card__head">
        <PersonaChip
          persona={bubble.author}
          createdAt={bubble.createdAt}
          showRole={false}
          onOpenProfile={onOpenProfile}
        />
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
        <span className="eg-card__meta">
          <span className={cx("eg-card__more", "t-caption")}>
            {bubble.sootheCount > 0 ? "あやす " + String(bubble.sootheCount) : "まだ あやされてない"}
          </span>
        </span>
      </button>

      <footer className="eg-card__foot">
        <ReactionRow
          targetKind="bubble"
          state={bubble.reactions}
          onReact={(reaction) => onReact(bubble.id, reaction)}
          readOnly={bubble.isMine}
        />
      </footer>
    </article>
  );
}
