import { cx } from "../lib/cx";
import { IconHome, IconPen } from "./icons";
import "./AppNav.css";

/*
 * ナビゲーション（DESIGN.md §8.1）。
 *
 * モバイル・タブレットでは下部、960px 以上では左に固定。
 * 深夜に片手で開かれる前提なので、主要な行き先は画面の下に置く。
 *
 * 置いていないもの：通知（画面一覧に無い。DESIGN.md §11 の未定事項）、
 * DM（OUT-001）、フォロワー関係（OUT-004）。今回の対象は S2〜S5 なので、
 * S7 / S8 への導線も作っていない（行き先のないリンクを置かない）。
 */

export type NavTarget = "timeline" | "compose";

const ITEMS: readonly { readonly target: NavTarget; readonly label: string }[] = [
  { target: "timeline", label: "ホーム" },
  { target: "compose", label: "かく" },
];

export function AppNav({
  current,
  onNavigate,
}: {
  readonly current: NavTarget;
  readonly onNavigate: (target: NavTarget) => void;
}) {
  return (
    <nav className="eg-nav" aria-label="メインナビゲーション">
      <ul className="eg-nav__list">
        {ITEMS.map((item) => (
          <li key={item.target}>
            <button
              type="button"
              aria-current={current === item.target ? "page" : undefined}
              className={cx("eg-nav__item", "eg-touch", current === item.target && "is-current")}
              onClick={() => onNavigate(item.target)}
            >
              {item.target === "timeline" ? <IconHome /> : <IconPen />}
              <span className="t-label">{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
