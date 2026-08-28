import type { ReactNode } from "react";

import { cx } from "../lib/cx";
import { REPLY_WORDING } from "../lib/replyWording";
import type { ReplyKind } from "../lib/replyWording";
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

/**
 * 返ってきたものが1件も無いときの空状態。
 *
 * ★ バブル詳細（S4）と あやす詳細（S4b）で同じものを出す。
 *   別々に書くと、片方だけ言い回しが変わる。
 * ★ ことばは返信先で変わる（人間の決定 2026-08-28）。お母さんのあやすへ返るのは
 *   赤ちゃんのバブルなので「まだ だれも バブっていません。」になる。
 *   文は lib/replyWording.ts が持っていて、ここは引くだけ。
 * ★ イラストは渡さない。どちらの画面でも入れ子の空状態なので、
 *   1画面に主役のイラストを2つ置かないため（上の ★ 参照）。
 */
export function NoSootheState({ kind = "soothe" }: { readonly kind?: ReplyKind } = {}) {
  return <EmptyState lines={REPLY_WORDING[kind].emptyLines} />;
}

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
