import { useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

import { cx } from "../lib/cx";
import { FIELD_HARD_MAX } from "../lib/floodGuard";
import "./TextField.css";

/*
 * 1行の入力欄（DESIGN.md §4 Inputs）。
 *
 * 背景 surface／枠 1px hairline／Radius rounded.md／Padding 12px／文字 16px。
 * Focus は outline で示す。枠色だけを変えない（色覚に依存させない）。
 *
 * エラーは色だけでなく文字でも出す（DESIGN.md §2.5）。
 * 入力そのものは止めない。止めるのは保存ボタンのほう（DESIGN.md §4 文字数カウンタと同じ考え）。
 *
 * ★ action は入力欄の**右隣**に置く小さな操作（パスワードの「みる」など）。
 *   欄の外に並べると、エラーの一行が出た瞬間に欄が縦に伸び、外のボタンだけが
 *   下へずれて入力欄と段が合わなくなる（2026-08-28 の確認で発生）。
 *   入力欄と同じ行に入れておけば、下に何行足しても位置は動かない。
 */

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  readonly label: string;
  /** 入力の前に読ませたい一行。何を入れる欄なのかを説明する */
  readonly hint?: string;
  /** 直せる形で出す。理由を書く。空文字は渡さない */
  readonly error?: string;
  /** 入力欄の右隣に並べる小さな操作。欄と同じ行に固定される */
  readonly action?: ReactNode;
};

export function TextField({ label, hint, error, action, id, maxLength, ...rest }: TextFieldProps) {
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
      <div className="eg-field__row">
        <input
          {...rest}
          id={fieldId}
          /*
           * 貼り付け事故の天井（lib/floodGuard.ts）。欄ごとの上限（ニックネーム 20 など）を
           * 渡していれば、そちらが勝つ。ここは何も指定していない欄が
           * 数十万文字を抱えないための最後の受け皿。
           */
          maxLength={maxLength ?? FIELD_HARD_MAX}
          className={cx("eg-field__input", "t-input", error && "is-error")}
          aria-invalid={error ? true : undefined}
          aria-describedby={cx(hintId, errorId) || undefined}
        />
        {action}
      </div>
      {error ? (
        <p id={errorId} className={cx("eg-field__error", "t-caption")} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
