import { useEffect, useState } from "react";

import { cx } from "../lib/cx";
import "./Toast.css";

/*
 * 完了のしらせ（DESIGN.md §7.3 toast）。
 * 下から 400ms で出て、消えるのは 350ms。完了を画面遷移だけで伝えなくて済む。
 */

/*
 * 出てから消え始めるまでの保持時間。アニメーションの長さではないので
 * motion.css のトークンには属さない（DESIGN.md §7.1 は遷移時間のスケール）。
 * 読み終わるのに足る長さを目で決めた値。
 */
const VISIBLE_MS = 2600;

type ToastProps = {
  readonly message: string;
  readonly onDone: () => void;
};

export function Toast({ message, onDone }: ToastProps) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const hideTimer = setTimeout(() => setLeaving(true), VISIBLE_MS);
    return () => clearTimeout(hideTimer);
  }, []);

  return (
    <div
      className={cx("eg-toast", "t-body", leaving && "is-leaving")}
      role="status"
      aria-live="polite"
      onAnimationEnd={() => {
        if (leaving) {
          onDone();
        }
      }}
    >
      {message}
    </div>
  );
}
