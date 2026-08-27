import type { PublicPersona } from "../data/types";
import { cx } from "../lib/cx";
import { relativeTimeText } from "../lib/relativeTime";
import { PersonaAvatar } from "./PersonaAvatar";
import "./PersonaChip.css";

/*
 * ペルソナの表示（DESIGN.md §4 Persona Badge / Avatar）。
 *
 * アバターの規則は PersonaAvatar が持つ（頭文字と役割色だけ。DESIGN.md §0.1-2/3）。
 *
 * onOpenProfile を渡すと、チップ全体が1つのボタンになり、S6（公開プロフィール）への
 * 入り口になる（人間の指示、2026-08-25：ニックネームだけでなくアイコンからも飛べるように）。
 * 中身の作りは押せるときと押せないときで変えていない。同じ場所に同じ形で出る。
 *
 * ★ タップ先は S6 だけ。DM の入口を作らない（OUT-001、DESIGN.md §0.5）。
 *   渡すのはペルソナ id ひとつで、そこから もう一方のペルソナへ辿る道は無い
 *   （FR-PERSONA-004）。
 */

const ROLE_LABEL = { baby: "赤ちゃん", mother: "お母さん" } as const;

type PersonaChipProps = {
  readonly persona: PublicPersona;
  /** 相対時刻。絶対時刻は title 属性にも入れない（DESIGN.md §0.1-5） */
  readonly createdAt?: string;
  readonly compact?: boolean;
  readonly showRole?: boolean;
  /** 渡すとチップ全体が S6 への入り口になる。渡さなければただの表示 */
  readonly onOpenProfile?: (personaId: string) => void;
};

export function PersonaChip({
  persona,
  createdAt,
  compact = false,
  showRole = true,
  onOpenProfile,
}: PersonaChipProps) {
  /* button の中に置けるのは phrasing content だけなので、中身は span だけで組む */
  const inner = (
    <>
      <PersonaAvatar kind={persona.kind} size={compact ? "sm" : "md"} />
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
    </>
  );

  const className = cx("eg-persona", compact && "eg-persona--compact");

  if (!onOpenProfile) {
    return <div className={className}>{inner}</div>;
  }

  return (
    <button
      type="button"
      className={cx(className, "eg-persona--link")}
      onClick={() => onOpenProfile(persona.id)}
      aria-label={persona.nickname + " のプロフィールを ひらく"}
    >
      {inner}
    </button>
  );
}

export { ROLE_LABEL };
