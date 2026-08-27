import type { ReactNode } from "react";

import { cx } from "../lib/cx";
import { Illustration } from "./Illustration";
import type { IllustrationName } from "./Illustration";
import "./EmptyState.css";

/*
 * 空状態（DESIGN.md §4 Empty State ／ UI刷新 2026-08-26）。
 *
 * コピーは責めない。動きは texts-reveal（12px + blur 3px を 40ms ずらし）。
 * ずらしの合計は 300ms 未満に収める（DESIGN.md §7.2）。
 *
 * ★ イラストは任意。渡された画面だけが主役として1枚出す。
 *   同じ画面の中で入れ子の空状態（バブル詳細の「まだ だれも あやしていません」）には
 *   渡さない。1画面に主役のイラストは1つまで。
 */

type EmptyStateProps = {
  readonly lines: readonly string[];
  readonly action?: ReactNode;
  /** 主役のイラスト。渡さなければ文字だけの空状態になる */
  readonly illustration?: IllustrationName;
};

export function EmptyState({ lines, action, illustration }: EmptyStateProps) {
  return (
    <div className={cx("eg-empty", illustration && "has-art")}>
      {illustration ? (
        <Illustration name={illustration} className="eg-empty__art" />
      ) : null}
      {lines.map((line, index) => (
        <p
          key={line}
          className="eg-empty__line t-body"
          style={{ animationDelay: "calc(var(--duration-stagger) * " + String(index) + ")" }}
        >
          {line}
        </p>
      ))}
      {action ? <div className="eg-empty__action">{action}</div> : null}
    </div>
  );
}
