import { useState } from "react";

import { REACTION_MAX_PER_USER } from "../data/constants";
import { REACTION_LABEL, REACTIONS_BY_TARGET } from "../data/reactions";
import type { ReactionState, ReactionTargetKind, ReactionType } from "../data/types";
import { cx } from "../lib/cx";
import { IconBabu, IconOgya, IconWakaruwa, IconYoshiyoshi } from "./icons";
import "./ReactionRow.css";

/*
 * リアクション行（DESIGN.md §0.2・§4）。
 *
 * ★ 対象の種類を props に取り、ボタンの数が 3 か 1 に変わる1つのコンポーネント。
 *   画面ごとにボタンを並べ直さない。出すボタンは data/reactions.ts の表だけが決める。
 *
 *   バブル / 赤ちゃんとしてのあやす → おぎゃー・よしよし・わかるわぁ の3種
 *   お母さんとしてのあやす        → ばぶー の1種のみ（FR-REACT-005/006）
 *
 * リアクションにペルソナの要素は無い（人間の決定、2026-08-24）。
 *
 * 1種類につき 5 回まで押せる（人間の決定、2026-08-25）。
 * 押した回数はラベル横の5つの点で示し、押すたびに1つ灯る。
 * 演出は回数に応じて強くなる（data-step）。1回目から粒子が出るので、
 * 1回で終わってもしょぼくならない。5回目だけ一段強い。
 *
 * 行は右寄せ（人間の決定、2026-08-25）。DESIGN.md §0.2 は「1種のときは左寄せ」と
 * 書いているが、PC 3カラムでは押しやすい側に寄せるという判断。§0.2 の改訂案は別途出す。
 */

const REACTION_ICON = {
  ogya: IconOgya,
  yoshiyoshi: IconYoshiyoshi,
  wakaruwa: IconWakaruwa,
  babu: IconBabu,
} as const;

/** 粒子の最大数。実際に見せる数は data-step から CSS 側で絞る */
const BURST_PARTICLES = 16;

type ReactionRowProps = {
  readonly targetKind: ReactionTargetKind;
  readonly state: ReactionState;
  readonly onReact: (reaction: ReactionType) => void;
  /** あやすの中に置くときは一段小さくする */
  readonly compact?: boolean;
  /** 自分のバブル・自分のあやす。押せるボタンを出さず、付いた数だけを見せる */
  readonly readOnly?: boolean;
};

export function ReactionRow({
  targetKind,
  state,
  onReact,
  compact = false,
  readOnly = false,
}: ReactionRowProps) {
  const [popping, setPopping] = useState<ReactionType | null>(null);

  if (readOnly) {
    // 付いているものだけを出す。0 のものを並べても読むものが無い
    const received = REACTIONS_BY_TARGET[targetKind].filter(
      (reaction) => (state.counts[reaction] ?? 0) > 0,
    );
    if (received.length === 0) {
      return <p className={cx("eg-reactions__none", "t-caption")}>まだ リアクションは ないよ</p>;
    }
    return (
      <ul className={cx("eg-reactions", compact && "eg-reactions--compact")}>
        {received.map((reaction) => {
          const Icon = REACTION_ICON[reaction];
          return (
            <li key={reaction}>
              <span className={cx("eg-reaction", "eg-reaction--readonly")}>
                <Icon className="eg-reaction__icon" />
                <span className="eg-reaction__label t-label">{REACTION_LABEL[reaction]}</span>
                <span className="eg-reaction__count t-counter">{state.counts[reaction]}</span>
              </span>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <ul className={cx("eg-reactions", compact && "eg-reactions--compact")}>
      {REACTIONS_BY_TARGET[targetKind].map((reaction) => {
        const Icon = REACTION_ICON[reaction];
        const count = state.counts[reaction] ?? 0;
        const mine = state.mine[reaction] ?? 0;
        const maxed = mine >= REACTION_MAX_PER_USER;
        return (
          <li key={reaction}>
            <button
              type="button"
              disabled={maxed}
              aria-label={
                REACTION_LABEL[reaction] +
                "。" +
                (maxed
                  ? "5回ぜんぶ おくりました"
                  : "あと" + String(REACTION_MAX_PER_USER - mine) + "回 おくれます")
              }
              className={cx("eg-reaction", "eg-touch", mine > 0 && "is-mine", maxed && "is-maxed")}
              data-step={popping === reaction ? String(mine) : undefined}
              onAnimationEnd={() => setPopping(null)}
              onClick={() => {
                setPopping(reaction);
                onReact(reaction);
              }}
            >
              <Icon className="eg-reaction__icon" />
              <span className="eg-reaction__label t-label">{REACTION_LABEL[reaction]}</span>

              {/*
                5つの点。押した回数ぶん灯る。
                まだ押していないボタンには出さない。5つの薄い点が並ぶと
                リーダー罫（……）に見えて、ラベルの一部として読まれてしまうため。
                1回押した時点で ●○○○○ が出るので、上限が5回であることはそこで伝わる。
              */}
              {mine > 0 ? (
                <span className="eg-reaction__meter" aria-hidden="true">
                  {Array.from({ length: REACTION_MAX_PER_USER }, (_, index) => (
                    <span key={index} className={cx("eg-dot", index < mine && "is-on")} />
                  ))}
                </span>
              ) : null}

              {count > 0 ? <span className="eg-reaction__count t-counter">{count}</span> : null}

              {/* 粒子。数は回数で増える。reduced-motion では出さない（DESIGN.md §7.5） */}
              <span className="eg-burst" aria-hidden="true">
                {Array.from({ length: BURST_PARTICLES }, (_, index) => (
                  <span key={index} />
                ))}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
