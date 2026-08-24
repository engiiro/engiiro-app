import { useCallback, useState } from "react";

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
 * 1種のときも横幅を引き伸ばさず左寄せにして、3種の行と同じリズムを保つ。
 *
 * リアクションにペルソナの要素は無い（人間の決定、2026-08-24）。
 * 「赤ちゃんとして押す／お母さんとして押す」という区別を持たない。
 *
 * 自分のバブル・自分のあやすには自分でリアクションできない（同上）。
 * その場合は readOnly で、押せるボタンを出さずに付いた数だけを見せる。
 * disabled のボタンを3つ並べるより、読み取りの行として出したほうが誤解が少ない。
 */

/** ラベルと同じく、種類ごとに1つ。「哺乳瓶」は wakaruwa の絵柄で、別のボタンにはしない */
const REACTION_ICON = {
  ogya: IconOgya,
  yoshiyoshi: IconYoshiyoshi,
  wakaruwa: IconWakaruwa,
  babu: IconBabu,
} as const;

type ReactionRowProps = {
  readonly targetKind: ReactionTargetKind;
  readonly state: ReactionState;
  readonly onToggle: (reaction: ReactionType) => void;
  /** あやすの中に置くときは一段小さくする */
  readonly compact?: boolean;
  /** 自分のバブル・自分のあやす。押せるボタンを出さず、付いた数だけを見せる */
  readonly readOnly?: boolean;
};

export function ReactionRow({
  targetKind,
  state,
  onToggle,
  compact = false,
  readOnly = false,
}: ReactionRowProps) {
  const [popping, setPopping] = useState<ReactionType | null>(null);

  const handleClick = useCallback(
    (reaction: ReactionType) => {
      // 押した瞬間に反応する（DESIGN.md §7.4）。数の更新はこの後の再取得で追いつく
      setPopping(reaction);
      onToggle(reaction);
    },
    [onToggle],
  );

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
        const isMine = state.mine.includes(reaction);
        return (
          <li key={reaction}>
            <button
              type="button"
              aria-pressed={isMine}
              className={cx("eg-reaction", "eg-touch", isMine && "is-mine")}
              data-pop={popping === reaction ? "true" : undefined}
              onAnimationEnd={() => setPopping(null)}
              onClick={() => handleClick(reaction)}
            >
              <Icon className="eg-reaction__icon" />
              <span className="eg-reaction__label t-label">{REACTION_LABEL[reaction]}</span>
              {/* 0 のときは数を出さない。数字は tabular-nums で幅が飛ばない */}
              {count > 0 ? <span className="eg-reaction__count t-counter">{count}</span> : null}
              {/* 粒子。reduced-motion では出さない（DESIGN.md §7.5） */}
              <span className="eg-burst" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
