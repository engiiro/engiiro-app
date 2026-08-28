import type { ReactNode } from "react";

import { cx } from "../lib/cx";
import { IconShield } from "./icons";
import "./NoteBox.css";

/*
 * 注記と拒否の表示（DESIGN.md §4 Note Box / 拒否バナー）。
 *
 * どちらも地は accent-soft、文字は accent-line。違うのは字の大きさだけ：
 *   note   … 仕様の説明（「バブルはいつでも赤ちゃん」など）。label サイズ
 *   reject … モデレーションの拒否。body サイズで、匿名性の保護として説明する
 *
 * 拒否のとき、判定の内部情報（理由コード・辞書・マッチした文字列）を渡す口を作っていない。
 * 渡せる形にしておくと、いつか画面に出る（FR-MOD-034 / FR-PRIV-006）。
 */

type NoteBoxProps = {
  readonly variant?: "note" | "reject";
  readonly title?: string;
  readonly children: ReactNode;
  readonly icon?: ReactNode;
  readonly role?: "status" | "alert";
};

export function NoteBox({
  variant = "note",
  title,
  children,
  icon,
  role = "status",
}: NoteBoxProps) {
  const textClass = variant === "reject" ? "t-body" : "t-label";
  return (
    <div className="eg-note" role={role}>
      <span className="eg-note__icon">{icon ?? <IconShield />}</span>
      <div className="eg-note__text">
        {title ? <strong className={cx("eg-note__title", "t-label")}>{title}</strong> : null}
        <div className={cx("eg-note__body", textClass)}>{children}</div>
      </div>
    </div>
  );
}

/**
 * モデレーションで拒否したときの文言。
 * Issue #11 の人間決定に沿った基準文（DESIGN.md §0.4）。ここ以外に書かない。
 */
export const MODERATION_REJECT_TEXT =
  "えんじいろでは、あなたと他の利用者の匿名性を守るため、個人が特定できる情報・外部連絡先・実際に会うための内容は投稿できません。";
