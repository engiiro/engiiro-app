import type { PersonaKind } from "../data/types";
import { cx } from "../lib/cx";
import "./PersonaAvatar.css";

/*
 * ペルソナのアバター（DESIGN.md §4 Persona Badge / Avatar）。
 *
 * ★ 絵柄は「役割の頭文字」と「役割色」だけで作る。
 *   id や accountId を種にした identicon・グラデーション・図形生成は禁止（DESIGN.md §0.1-3）。
 *   種から絵柄を作ると、両ペルソナで同じ絵柄が出て非連結が崩れる（FR-PERSONA-003）。
 *
 * 役割色は全利用者で共通。利用者ごとに色を割り当てない（DESIGN.md §0.1-2）。
 * 割り当てた時点で、その色そのものが同一人物の手がかりになる。
 *
 * 大きさは3つだけ。画面ごとに px を決めない：
 *   sm … あやすの中（26px）
 *   md … カードの見出し（34px）
 *   lg … プロフィールの見出し（64px）
 */

export type AvatarSize = "sm" | "md" | "lg";

const ROLE_INITIAL = { baby: "赤", mother: "母" } as const;

export function PersonaAvatar({
  kind,
  size = "md",
  className,
}: {
  readonly kind: PersonaKind;
  readonly size?: AvatarSize;
  readonly className?: string;
}) {
  return (
    <span
      className={cx("eg-avatar", "eg-avatar--" + kind, "eg-avatar--" + size, className)}
      aria-hidden="true"
    >
      {ROLE_INITIAL[kind]}
    </span>
  );
}

export { ROLE_INITIAL };
