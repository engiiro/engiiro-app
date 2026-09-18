import type { ReactNode } from "react";
import { cx } from "../../lib/cx";

export function ComposeToolButton({
  active,
  onClick,
  icon,
  label,
}: {
  readonly active: boolean;
  readonly onClick: () => void;
  readonly icon: ReactNode;
  readonly label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cx("eg-tool", "eg-touch", active && "is-active")}
      onClick={onClick}
    >
      {icon}
      <span className="t-label">{label}</span>
    </button>
  );
}

