import type { PublicPersona } from "../data/types";
import { cx } from "../lib/cx";
import { relativeTimeText } from "../lib/relativeTime";
import "./PersonaChip.css";

/*
 * ペルソナの表示（DESIGN.md §4 Persona Badge / Avatar）。
 *
 * アバターは頭文字と役割色だけで作る。
 * ID を種にした identicon・グラデーション・図形生成は禁止（DESIGN.md §0.1-3）。
 * 両ペルソナで同じ絵柄が出て非連結が崩れるため。
 *
 * ペルソナ色は「役割」の色で、利用者ごとに割り当てない（DESIGN.md §0.1-2）。
 *
 * ニックネームは本来 S6（公開プロフィール）への入り口だが、S6 は今回の対象外なので
 * リンクにしていない。DM の入口を作らないため、タップ先は将来も S6 だけ（DESIGN.md §0.5）。
 */

const ROLE_INITIAL = { baby: "赤", mother: "母" } as const;
const ROLE_LABEL = { baby: "赤ちゃん", mother: "お母さん" } as const;

type PersonaChipProps = {
  readonly persona: PublicPersona;
  /** 相対時刻。絶対時刻は title 属性にも入れない（DESIGN.md §0.1-5） */
  readonly createdAt?: string;
  readonly compact?: boolean;
  readonly showRole?: boolean;
};

export function PersonaChip({
  persona,
  createdAt,
  compact = false,
  showRole = true,
}: PersonaChipProps) {
  return (
    <div className={cx("eg-persona", compact && "eg-persona--compact")}>
      <span
        className={cx("eg-persona__avatar", "eg-persona__avatar--" + persona.kind)}
        aria-hidden="true"
      >
        {ROLE_INITIAL[persona.kind]}
      </span>
      <span className="eg-persona__text">
        <span className="eg-persona__name t-card-title">{persona.nickname}</span>
        <span className="eg-persona__meta">
          {showRole ? (
            <span className={cx("eg-persona__role", "t-label", "is-" + persona.kind)}>
              {ROLE_LABEL[persona.kind]}
            </span>
          ) : null}
          {createdAt ? (
            <span className="eg-persona__time t-caption">{relativeTimeText(createdAt)}</span>
          ) : null}
        </span>
      </span>
    </div>
  );
}

export { ROLE_LABEL };
