import type { ReactNode } from "react";

import { cx } from "../lib/cx";
import { IconBack } from "./icons";
import "./ScreenHeader.css";

/** 画面の見出し。もどる先があるときだけ左に置く */
export function ScreenHeader({
  title,
  onBack,
  aside,
}: {
  readonly title: string;
  readonly onBack?: () => void;
  readonly aside?: ReactNode;
}) {
  return (
    <header className="eg-screen-head">
      <div className={cx("eg-screen-head__inner", "eg-column")}>
        {onBack ? (
          <button
            type="button"
            className="eg-screen-head__back"
            onClick={onBack}
            aria-label="もどる"
          >
            <IconBack />
          </button>
        ) : null}
        <h1 className={cx("eg-screen-head__title", "t-display")}>{title}</h1>
        {aside ? <div className={cx("eg-screen-head__sub", "t-caption")}>{aside}</div> : null}
      </div>
    </header>
  );
}
