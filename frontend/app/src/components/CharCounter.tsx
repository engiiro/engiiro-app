import { BUBBLE_MAX_LENGTH, BUBBLE_WARN_REMAINING, countChars } from "../data/constants";
import { cx } from "../lib/cx";
import "./CharCounter.css";

/*
 * 文字数カウンタ（DESIGN.md §4 文字数カウンタ、FR-POST-002 / NFR-005）。
 *
 * 150 を超えても入力は止めない。弱音を書いている途中で文字が消えるのが、
 * このサービスでいちばん避けたい体験。仕様が禁じているのは「保存」であって「入力」ではない。
 * 止めるのは保存ボタン側（isOverLimit を見て disabled にする）。
 */

export function CharCounter({ text }: { readonly text: string }) {
  const count = countChars(text);
  const remaining = BUBBLE_MAX_LENGTH - count;
  const over = remaining < 0;
  const near = !over && remaining <= BUBBLE_WARN_REMAINING;

  return (
    <div className="eg-counter">
      <span
        className={cx("eg-counter__value", "t-counter", (over || near) && "is-warn")}
        /* 数字の読み上げが騒がしくならないよう、超過の一行だけを live にする */
        aria-hidden="true"
      >
        {count} / {BUBBLE_MAX_LENGTH}
      </span>
      {over ? (
        <p className={cx("eg-counter__reason", "t-counter")} role="status">
          {BUBBLE_MAX_LENGTH}文字までにしてね。あと {remaining}文字
        </p>
      ) : null}
    </div>
  );
}
