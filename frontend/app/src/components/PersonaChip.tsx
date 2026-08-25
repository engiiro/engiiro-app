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
 * ニックネームは S6（公開プロフィール）への入り口。onOpenProfile を渡すと押せるようになる。
 * ★ タップ先は S6 だけ。DM の入口を作らない（OUT-001、DESIGN.md §0.5）。
 *   渡す先はペルソナ id ひとつで、そこから もう一方のペルソナへ辿る道は無い（FR-PERSONA-004）。
 */

const ROLE_LABEL = { baby: "赤ちゃん", mother: "お母さん" } as const;

type PersonaChipProps = {
  readonly persona: PublicPersona;
  /** 相対時刻。絶対時刻は title 属性にも入れない（DESIGN.md §0.1-5） */
  readonly createdAt?: string;
  readonly compact?: boolean;
  readonly showRole?: boolean;
  /** 渡すとニックネームが S6 への入り口になる。渡さなければただの文字 */
  readonly onOpenProfile?: (personaId: string) => void;
};

export function PersonaChip({
  persona,
  createdAt,
  compact = false,
  showRole = true,
  onOpenProfile,
}: PersonaChipProps) {
  return (
    <div className={cx("eg-persona", compact && "eg-persona--compact")}>
      <PersonaAvatar kind={persona.kind} size={compact ? "sm" : "md"} />
      <span className="eg-persona__text">
        {onOpenProfile ? (
          <button
            type="button"
            className="eg-persona__name eg-persona__name--link t-card-title"
            onClick={() => onOpenProfile(persona.id)}
          >
            {persona.nickname}
          </button>
        ) : (
          <span className="eg-persona__name t-card-title">{persona.nickname}</span>
        )}
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
