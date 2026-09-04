import type { ReactElement } from "react";

import { cx } from "../lib/cx";
import { BrandMark } from "./BrandMark";
import { BrandWordmark } from "./BrandWordmark";
import { IconBell, IconGear, IconHeart, IconHome, IconPerson, IconSearch } from "./icons";
import "./LeftRail.css";

/*
 * 左サイド（人間の決定、2026-08-25）。
 *
 * どれを押しても中央の列が差し替わる。右サイドは動かない。
 *
 * ホーム・おきにいり・プロフィール・せってい以外は docs/design_doc.md §4.1 の画面一覧
 * （S1〜S8）に無い画面で、
 * 今は「準備中」を出すだけのプレースホルダ。設計書の画面一覧の更新は
 * backend / 設計担当の領域なので、こちらでは触っていない。
 *
 * せっていも画面一覧には無いが、テーマの切り替え（DESIGN.md §8.3）という
 * 決まっている設定があるので中身を作った（人間の指示、2026-08-27）。
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
  { view: "settings", label: "せってい", icon: IconGear, ready: true },
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
      {/*
        名乗り。細い列（1199px 以下）では印だけが残り、文字は消える。
        印そのものは全利用者で同じ絵柄なので、誰かを識別する手がかりにはならない。

        ★ 園児UI では、文字の部分が手書きの画像に変わる（BrandWordmark.tsx）。
          消す条件（.eg-rail__logo の display:none）は文字と画像で同じなので、
          細い列での振る舞いはテーマによって変わらない。
      */}
      <div className="eg-rail__brand">
        <BrandMark className="eg-rail__mark" />
        <BrandWordmark className="eg-rail__logo" />
      </div>
      <ul className="eg-rail__list">
        {RAIL_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.view}>
              <button
                type="button"
                aria-current={current === item.view ? "page" : undefined}
                /*
                 * 1199px 未満（さらに 767px 未満のボトムバーでも）は .eg-rail__label /
                 * .eg-rail__soon を display:none にして文字を消している（LeftRail.css）。
                 * display:none は読み上げからも消えるので、そのままだとボタンに
                 * アクセシブルネームが1つも残らない。aria-label は見た目の表示状態に
                 * 依存しないので、ここで明示しておく（人間の指摘）。
                 */
                aria-label={item.ready ? item.label : item.label + "（準備中）"}
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
