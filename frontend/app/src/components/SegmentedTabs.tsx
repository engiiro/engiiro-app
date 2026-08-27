import type { ReactElement } from "react";

import { cx } from "../lib/cx";
import "./SegmentedTabs.css";

/*
 * 横並びの切り替えボタン（人間の指示、2026-08-25 のモック）。
 *
 * S8 と、この先のプロフィール系の画面で同じものを使う。
 * 画面ごとに似て非なるタブを作らないための1つの部品。
 *
 * 選択中は色だけでなく文字の太さも変える（DESIGN.md §2.5：色だけに意味を持たせない）。
 * 読み上げには tab / tablist として渡す。
 */

export type SegmentedTab<T extends string> = {
  readonly value: T;
  readonly label: string;
  readonly icon?: (props: { className?: string }) => ReactElement;
};

type SegmentedTabsProps<T extends string> = {
  readonly tabs: readonly SegmentedTab<T>[];
  readonly current: T;
  readonly onChange: (value: T) => void;
  /** tabpanel 側の id。読み上げでの対応づけに使う */
  readonly panelId: string;
  readonly label: string;
  /*
   * 並べ方。
   *   fill   … 等分に敷き詰める（既定。S8 のような 2〜3 個のタブ）
   *   scroll … 中身の幅のまま横に流す（4 個以上、または細い列に置くとき）
   * 見た目の作りは同じで、変わるのは幅の配り方だけ。似て非なるタブを増やさないため、
   * 新しい部品ではなく変種にしている。
   */
  readonly variant?: "fill" | "scroll";
};

export function SegmentedTabs<T extends string>({
  tabs,
  current,
  onChange,
  panelId,
  label,
  variant = "fill",
}: SegmentedTabsProps<T>) {
  return (
    <div
      className={cx("eg-segmented", variant === "scroll" && "eg-segmented--scroll")}
      role="tablist"
      aria-label={label}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const selected = tab.value === current;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            id={panelId + "-tab-" + tab.value}
            aria-selected={selected}
            aria-controls={panelId}
            /* 選択中のタブだけが Tab キーの止まり先になる（tablist の作法） */
            tabIndex={selected ? 0 : -1}
            className={cx("eg-segmented__item", "eg-touch", "t-label", selected && "is-current")}
            onClick={() => onChange(tab.value)}
          >
            {Icon ? <Icon className="eg-segmented__icon" /> : null}
            <span className="eg-segmented__label">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
