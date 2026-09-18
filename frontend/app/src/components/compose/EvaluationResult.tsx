import type { AiEvaluateResult } from "../../data/api";
import type { PersonaKind } from "../../data/types";
import { cx } from "../../lib/cx";
import { MAX_MONTHS } from "../../lib/mockAiEvaluate";
import { NoteBox } from "../NoteBox";
import { IconGauge } from "../icons";

/**
 * 赤ちゃん度・お母さん度（FR-AI-EVAL-001〜004）。
 * バーだけで伝えず、数値を添える（DESIGN.md §4 Meter）。
 *
 * ここは「自分がいまどれくらいか」を見るための場所で、合否は出さない
 * （PO 説明 2026-08-25、Issue #19）。保存してよいかを決めるのは backend で、
 * その閾値は frontend に無い。
 */
export function EvaluationResult({
  busy,
  failed,
  result,
  personaKind,
  hasBody,
}: {
  readonly busy: boolean;
  readonly failed: boolean;
  readonly result: AiEvaluateResult | null;
  readonly personaKind: PersonaKind;
  readonly hasBody: boolean;
}) {
  if (!hasBody) {
    return <p className={cx("t-body", "eg-drawer__note")}>なにか 書いてから ためしてね。</p>;
  }
  if (busy) {
    return <p className={cx("t-body", "eg-drawer__note")} role="status">はかっています…</p>;
  }
  if (failed) {
    return (
      <NoteBox title="ことばのお手伝い" icon={<IconGauge />}>
        いま はかれません。はかれないあいだは 投稿できません。
      </NoteBox>
    );
  }
  if (!result) {
    return null;
  }
  return (
    <div className="eg-evaluate">
      <p className={cx("eg-evaluate__axis", "t-label")}>{result.axis}</p>
      <p className={cx("eg-evaluate__value", "t-metric")}>{result.label}</p>
      <div
        className="eg-meter"
        role="img"
        aria-label={result.axis + " " + result.label}
      >
        <span
          className={cx("eg-meter__fill", "is-" + personaKind)}
          style={{ width: String(Math.round((result.months / MAX_MONTHS) * 100)) + "%" }}
        />
      </div>
      <p className={cx("eg-evaluate__note", "t-caption")}>
        書きかえたら、もう一度 はかってね。
      </p>
    </div>
  );
}
