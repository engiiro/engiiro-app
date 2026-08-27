import type { ReactElement } from "react";

import { cx } from "../lib/cx";
import { IconChevronRight } from "./icons";
import "./RowLink.css";

/*
 * 「ラベル ─ 数 ─ ＞」の1行（人間の指示、2026-08-25 のモック）。
 *
 * S8 のフォロー欄がこれ。押すと一覧の画面へ進む。
 *
 * ★ ここに出す数は「フォロー中」の数だけ。
 *   「フォローされている」数はどの画面にも出さない。本人にも見せない
 *   （FR-FOLLOW-004/005、OUT-004）。0 を出すのではなく、行そのものを作らない。
 *
 * count を省いたときは数を出さない。「まだ 0 件」を数字で突きつけないため。
 */

type RowLinkProps = {
  readonly label: string;
  readonly count?: number;
  readonly icon?: (props: { className?: string }) => ReactElement;
  /** アイコンと数に付ける役割色。ペルソナの種類に合わせる */
  readonly tone?: "baby" | "mother";
  readonly onClick: () => void;
};

export function RowLink({ label, count, icon: Icon, tone, onClick }: RowLinkProps) {
  return (
    <button
      type="button"
      className={cx("eg-rowlink", "eg-touch", tone && "is-" + tone)}
      onClick={onClick}
    >
      {Icon ? <Icon className="eg-rowlink__icon" /> : null}
      <span className={cx("eg-rowlink__label", "t-body")}>{label}</span>
      {count === undefined ? null : (
        <span className={cx("eg-rowlink__count", "t-metric")}>{count}</span>
      )}
      <IconChevronRight className="eg-rowlink__chevron" />
    </button>
  );
}
