import type { ReactNode } from "react";

import "./EmptyState.css";

/*
 * 空状態（DESIGN.md §4 Empty State）。
 *
 * コピーは責めない。動きは texts-reveal（12px + blur 3px を 40ms ずらし）。
 * ずらしの合計は 300ms 未満に収める（DESIGN.md §7.2）。
 */

type EmptyStateProps = {
  readonly lines: readonly string[];
  readonly action?: ReactNode;
};

export function EmptyState({ lines, action }: EmptyStateProps) {
  return (
    <div className="eg-empty">
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
