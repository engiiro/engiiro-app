import { useId } from "react";
import type { InputHTMLAttributes } from "react";

import { cx } from "../lib/cx";
import "./TextField.css";

/*
 * 1行の入力欄（DESIGN.md §4 Inputs）。
 *
 * 背景 surface／枠 1px hairline／Radius rounded.md／Padding 12px／文字 16px。
 * Focus は outline で示す。枠色だけを変えない（色覚に依存させない）。
 *
 * エラーは色だけでなく文字でも出す（DESIGN.md §2.5）。
 * 入力そのものは止めない。止めるのは保存ボタンのほう（DESIGN.md §4 文字数カウンタと同じ考え）。
 */

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  readonly label: string;
  /** 入力の前に読ませたい一行。何を入れる欄なのかを説明する */
  readonly hint?: string;
  /** 直せる形で出す。理由を書く。空文字は渡さない */
  readonly error?: string;
};

export function TextField({ label, hint, error, id, ...rest }: TextFieldProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  const hintId = hint ? fieldId + "-hint" : undefined;
  const errorId = error ? fieldId + "-error" : undefined;

  return (
    <div className="eg-field">
      <label className={cx("eg-field__label", "t-label")} htmlFor={fieldId}>
        {label}
      </label>
      {hint ? (
        <p id={hintId} className={cx("eg-field__hint", "t-caption")}>
          {hint}
        </p>
      ) : null}
      <input
        {...rest}
        id={fieldId}
        className={cx("eg-field__input", "t-input", error && "is-error")}
        aria-invalid={error ? true : undefined}
        aria-describedby={cx(hintId, errorId) || undefined}
      />
      {error ? (
        <p id={errorId} className={cx("eg-field__error", "t-caption")} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
