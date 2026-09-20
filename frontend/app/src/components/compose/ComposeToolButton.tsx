import type { ReactNode } from "react";
import { cx } from "../../lib/cx";

export function ComposeToolButton({
  active,
  inviting = false,
  justInviting = false,
  onInviteEnd,
  onClick,
  icon,
  label,
}: {
  readonly active: boolean;
  readonly inviting?: boolean;
  readonly justInviting?: boolean;
  readonly onInviteEnd?: () => void;
  readonly onClick: () => void;
  readonly icon: ReactNode;
  readonly label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cx(
        "eg-tool",
        "eg-touch",
        active && "is-active",
        !active && inviting && "is-inviting",
        !active && inviting && justInviting && "is-just-inviting",
      )}
      onClick={onClick}
      onAnimationEnd={onInviteEnd}
    >
      {icon}
      <span className="t-label">{label}</span>
    </button>
  );
}
