import type { ReactElement } from "react";

import { cx } from "../lib/cx";
import { IconBell, IconGear, IconHeart, IconHome, IconPerson, IconSearch } from "./icons";
import "./LeftRail.css";

/*
 * 左サイド（人間の決定、2026-08-25）。
 *
 * どれを押しても中央の列が差し替わる。右サイドは動かない。
 *
 * ホーム・おきにいり・プロフィール以外は docs/design_doc.md §4.1 の画面一覧（S1〜S8）に
 * 無い画面で、
 * 今は「準備中」を出すだけのプレースホルダ。設計書の画面一覧の更新は
 * backend / 設計担当の領域なので、こちらでは触っていない。
 *
 * プロフィールは S8（本人専用プロフィール）。両ペルソナを同時に出してよい唯一の画面
 * （FR-PERSONA-005）なので、他の画面から同じ中身を出さない。
 *
 * おきにいりは S7（大好きな人の一覧＝フォロー中一覧、FR-FOLLOW-003）。
 * 本人だけが見られる。「大好きされた側」の一覧はここにも作らない（OUT-004）。
 *
 * 置いていないもの：DM の入口（OUT-001）、フォロワー関係（OUT-004）。
 */

export type CenterView =
  | "timeline"
  | "search"
  | "notifications"
  | "favorites"
  | "profile"
  | "settings";

type RailItem = {
  readonly view: CenterView;
  readonly label: string;
  readonly icon: (props: { className?: string }) => ReactElement;
  /** 中身のある画面かどうか。準備中のものは中央に案内を出すだけ */
  readonly ready: boolean;
};

const RAIL_ITEMS: readonly RailItem[] = [
  { view: "timeline", label: "ホーム", icon: IconHome, ready: true },
  { view: "search", label: "さがす", icon: IconSearch, ready: false },
  { view: "notifications", label: "おしらせ", icon: IconBell, ready: false },
  { view: "favorites", label: "おきにいり", icon: IconHeart, ready: true },
  { view: "profile", label: "プロフィール", icon: IconPerson, ready: true },
  { view: "settings", label: "せってい", icon: IconGear, ready: false },
];

export function LeftRail({
  current,
  onNavigate,
}: {
  readonly current: CenterView;
  readonly onNavigate: (view: CenterView) => void;
}) {
  return (
    <nav className="eg-rail" aria-label="メインナビゲーション">
      <div className="eg-rail__brand">
        <span className={cx("eg-rail__logo", "t-display")}>えんじいろ</span>
      </div>
      <ul className="eg-rail__list">
        {RAIL_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.view}>
              <button
                type="button"
                aria-current={current === item.view ? "page" : undefined}
                className={cx("eg-rail__item", "eg-touch", current === item.view && "is-current")}
                onClick={() => onNavigate(item.view)}
              >
                <Icon className="eg-rail__icon" />
                <span className={cx("eg-rail__label", "t-body")}>{item.label}</span>
                {!item.ready ? (
                  <span className={cx("eg-rail__soon", "t-caption")}>準備中</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
