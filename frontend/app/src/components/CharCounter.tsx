import type { CSSProperties } from "react";

import { BUBBLE_MAX_LENGTH, BUBBLE_WARN_REMAINING, countChars } from "../data/constants";
import { cx } from "../lib/cx";
import "./CharCounter.css";

/*
 * 文字数カウンタ（DESIGN.md §4 文字数カウンタ、FR-POST-002 / NFR-005）。
 *
 * 150 を超えても入力は止めない。弱音を書いている途中で文字が消えるのが、
 * このサービスでいちばん避けたい体験。仕様が禁じているのは「保存」であって「入力」ではない。
 * 止めるのは保存ボタン側（isOverLimit を見て disabled にする）。
 *
 * ★ 見た目は「ふくらんでいく輪」にした（UI刷新 2026-08-26）。
 *   バブルの上限を、減っていく数字ではなく、満ちていく形で返す。
 *   ただし輪だけにしない。数値を必ず添える（DESIGN.md §4 Meter の規則）。
 */

export function CharCounter({ text }: { readonly text: string }) {
  const count = countChars(text);
  const remaining = BUBBLE_MAX_LENGTH - count;
  const over = remaining < 0;
  const near = !over && remaining <= BUBBLE_WARN_REMAINING;

  /* 超過してもリングは満杯で止める。はみ出した量は下の一行が数字で伝える */
  const filled = Math.min(count / BUBBLE_MAX_LENGTH, 1);
  const gaugeStyle = {
    "--eg-counter-fill": String(Math.round(filled * 100)) + "%",
  } as CSSProperties;

  return (
    <div className={cx("eg-counter", over && "is-over", near && "is-near")}>
      <div className="eg-counter__row">
        <span className="eg-counter__gauge" style={gaugeStyle} aria-hidden="true" />
        <span
          className={cx("eg-counter__value", "t-counter")}
          /* 数字の読み上げが騒がしくならないよう、超過の一行だけを live にする */
          aria-hidden="true"
        >
          {count} / {BUBBLE_MAX_LENGTH}
        </span>
      </div>
      {over ? (
        <p className={cx("eg-counter__reason", "t-counter")} role="status">
          {BUBBLE_MAX_LENGTH}文字までにしてね。{-remaining}文字 おおいよ
        </p>
      ) : null}
    </div>
  );
}
