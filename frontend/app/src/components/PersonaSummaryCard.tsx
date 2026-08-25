import type { ReactNode } from "react";

import type { PublicPersona } from "../data/types";
import { cx } from "../lib/cx";
import { PersonaAvatar } from "./PersonaAvatar";
import "./PersonaSummaryCard.css";

/*
 * プロフィールの見出しカード（人間の指示、2026-08-25 のモック）。
 *
 *   ［アバター］ ニックネーム
 *                推定 1歳2か月 / 推定 1歳児を あやし中
 *
 * S8 では2枚並べる。プロフィール系の画面で同じ形を使うための部品で、
 * 中身（caption・footer）だけを画面側が差し替える。
 *
 * ★ S8 は、自分の両ペルソナを同じ画面に並べてよい唯一の場所（FR-PERSONA-005、DESIGN.md §0.1-1）。
 *   このカードを2枚並べる画面を、S8 以外に作らない。
 */

type PersonaSummaryCardProps = {
  readonly persona: PublicPersona;
  /** ニックネームの下の一行。「推定 1歳2か月」など */
  readonly caption: ReactNode;
  /** さらに下に足すもの。メーターやひとことを入れる */
  readonly footer?: ReactNode;
};

export function PersonaSummaryCard({ persona, caption, footer }: PersonaSummaryCardProps) {
  return (
    <section className={cx("eg-summary", "is-" + persona.kind)}>
      <div className="eg-summary__head">
        <PersonaAvatar kind={persona.kind} size="lg" />
        <div className="eg-summary__text">
          <h2 className={cx("eg-summary__name", "t-heading", "is-" + persona.kind)}>
            {persona.nickname}
          </h2>
          <p className={cx("eg-summary__caption", "t-body")}>{caption}</p>
        </div>
      </div>
      {footer ? <div className="eg-summary__foot">{footer}</div> : null}
    </section>
  );
}
