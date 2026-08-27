import { useState } from "react";
import type { ReactNode } from "react";

import type { ActivityEntry, ActivityTab } from "../data/types";
import { ActivityItem } from "./ActivityItem";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { SkeletonFeed } from "./Skeleton";
import "./ActivityPanel.css";

/*
 * プロフィールの一覧（tabpanel の中身）。
 *
 * ★ S8（本人）と S6（他人）で同じものを出していたので、1つの部品にまとめた
 *   （2026-08-28 のリファクタリング）。以前は両方の画面に、
 *   skeleton → 空状態 → 一覧 → 「さらに よみこむ」という同じ 40 行が別々に置かれ、
 *   CSS も `__panel` / `__list` / `__more` が両方に複製されていた。
 *
 * ★ 切り替えるタブそのものは画面が持つ（S8 は3つ、S6 はペルソナの種類で1つか2つ）。
 *   ここが受け取るのは「いまどのタブか」だけ。タブの中身を決めるのは画面の仕事。
 *
 * ★ 何件見せているかはこの部品が覚える。タブが変わったら先頭の5件に戻す。
 *   前のタブで「さらに よみこむ」を押した回数を、別のタブに持ち込まない。
 */

/** 一度に見せる件数。押すたびにこの数ずつ増える */
const PAGE_SIZE = 5;

type ActivityPanelProps = {
  /** tabpanel の id。SegmentedTabs に渡した panelId と同じものを渡す */
  readonly panelId: string;
  /** いま選ばれているタブ。読み上げの対応づけと、件数の巻き戻しに使う */
  readonly tab: ActivityTab;
  readonly items: readonly ActivityEntry[];
  readonly loading: boolean;
  readonly emptyLines: readonly string[];
  /** 空のときに出す誘い。他人の画面では渡さない（他人の代わりに書けない） */
  readonly emptyAction?: ReactNode;
  readonly onOpenBubble: (bubbleId: string) => void;
  readonly onOpenSoothe: (sootheId: string) => void;
  /** 自分のバブルにだけ渡る。あやすの削除は仕様に無い（FR-POST-006） */
  readonly onDelete?: (bubbleId: string) => void;
};

export function ActivityPanel({
  panelId,
  tab,
  items,
  loading,
  emptyLines,
  emptyAction,
  onOpenBubble,
  onOpenSoothe,
  onDelete,
}: ActivityPanelProps) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  /*
   * タブが変わったら先頭に戻す。
   * props の変化に合わせて state を直す型（effect にしない。
   * effect で書くと、いちど古い件数のまま描いてから直すことになる）。
   */
  const [lastTab, setLastTab] = useState(tab);
  if (lastTab !== tab) {
    setLastTab(tab);
    setVisible(PAGE_SIZE);
  }

  const shown = items.slice(0, visible);
  const hasMore = items.length > shown.length;
  const isEmpty = !loading && items.length === 0;

  return (
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={panelId + "-tab-" + tab}
      className="eg-activity-panel"
    >
      {loading ? <SkeletonFeed count={2} /> : null}

      {isEmpty ? <EmptyState lines={emptyLines} action={emptyAction} /> : null}

      {!loading && !isEmpty ? (
        <>
          <ul className="eg-activity-panel__list">
            {shown.map((item) => (
              <ActivityItem
                key={item.kind === "bubble" ? item.bubble.id : item.soothe.id}
                item={item}
                onOpenBubble={onOpenBubble}
                onOpenSoothe={onOpenSoothe}
                onDelete={item.kind === "bubble" ? onDelete : undefined}
              />
            ))}
          </ul>
          {hasMore ? (
            <div className="eg-activity-panel__more">
              <Button variant="quiet" onClick={() => setVisible(visible + PAGE_SIZE)}>
                さらに よみこむ
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
