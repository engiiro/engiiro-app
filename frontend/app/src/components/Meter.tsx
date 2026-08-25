import type { PersonaKind } from "../data/types";
import { cx } from "../lib/cx";
import "./Meter.css";

/*
 * 赤ちゃん度・お母さん度のメーター（DESIGN.md §4 Meter）。
 *
 * ★ バーだけで伝えない。数値の文字を必ず並べる。
 *   色と長さだけに意味を持たせると、色覚と細かい差の読み取りに依存する（DESIGN.md §2.5）。
 *
 * 赤ちゃん度とお母さん度は別の軸で、同じ尺度の値ではない（FR-AI-EVAL-002）。
 * 2本並べても「どちらが大きい」という読み方をさせないよう、軸の名前を必ず添える。
 */

type MeterProps = {
  readonly kind: PersonaKind;
  /** 何か月相当か */
  readonly value: number;
  readonly max: number;
  /** 「1歳2か月」のような表示用の文字 */
  readonly label: string;
  /** 軸の名前。何を測ったのかを文字でも示す */
  readonly axis: string;
};

export function Meter({ kind, value, max, label, axis }: MeterProps) {
  const ratio = max === 0 ? 0 : Math.min(1, Math.max(0, value / max));
  return (
    <div className="eg-meter">
      <div className="eg-meter__head">
        <span className={cx("eg-meter__value", "t-metric", "is-" + kind)}>{label}</span>
        <span className={cx("eg-meter__axis", "t-caption")}>{axis}</span>
      </div>
      <div
        className={cx("eg-meter__track", "is-" + kind)}
        role="meter"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuetext={label}
        aria-label={axis}
      >
        <span className="eg-meter__fill" style={{ inlineSize: String(ratio * 100) + "%" }} />
      </div>
    </div>
  );
}
