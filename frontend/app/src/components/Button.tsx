import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";

import { cx } from "../lib/cx";
import "./Button.css";

/*
 * ボタン（DESIGN.md §4 Buttons）。
 *
 * Primary の背景は accent-fill。全幅で高さが 48px を超えるものは accent-fill-large
 * （面積が変われば色も変える。DESIGN.md §5.3-2）。
 * Disabled は非表示にせず opacity を落とす。S3 のお母さんボタンがここ（DESIGN.md §0.3）。
 */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: "primary" | "ghost" | "quiet";
  readonly fullWidth?: boolean;
  readonly children: ReactNode;
  /** React 19 では ref を通常の props として受け取れる */
  readonly ref?: Ref<HTMLButtonElement>;
};

export function Button({
  variant = "primary",
  fullWidth = false,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={cx(
        "eg-button",
        "t-button",
        "eg-button--" + variant,
        fullWidth && "eg-button--full",
        className,
      )}
    >
      {children}
    </button>
  );
}
