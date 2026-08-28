import { useEffect, useState } from "react";

import { REACTION_MAX_PER_USER } from "../data/constants";
import { REACTION_LABEL, REACTIONS_BY_TARGET } from "../data/reactions";
import type { ReactionState, ReactionTargetKind, ReactionType } from "../data/types";
import { cx } from "../lib/cx";
import { IconBabu, IconOgya, IconManma, IconYoshiyoshi } from "./icons";
import "./ReactionRow.css";

/*
 * リアクション行（DESIGN.md §0.2・§4）。
 *
 * ★ 対象の種類を props に取り、ボタンの数が 3 か 1 に変わる1つのコンポーネント。
 *   画面ごとにボタンを並べ直さない。出すボタンは data/reactions.ts の表だけが決める。
 *
 *   バブル / 赤ちゃんとしてのあやす → おぎゃー・よしよし・まんま の3種
 *   お母さんとしてのあやす        → ばぶー の1種のみ（FR-REACT-005/006）
 *
 * リアクションにペルソナの要素は無い（人間の決定、2026-08-24）。
 *
 * ── 5回ぶんの見せ方（人間の指示、2026-08-27） ────────────────────────────
 *
 * 1種類につき 5 回まで押せる（人間の決定、2026-08-25）。
 *
 * ★ 点が5つ埋まっていく形はやめた。
 *   「点が5個」は残り回数の**表**であって、押した実感ではない。押すたびにボタンの
 *   地が下から満ちて濃くなり、5回目で満タンになる形に替えた（人間の指示 2026-08-27）。
 *
 * ★ 濃さは「水位（.eg-reaction__flood）」で作る。地の色を段々暗くするのではない。
 *   中間の濁った色（臙脂と surface の 50% 混色）の上には、臙脂も白も 3:1 に届かない。
 *   そこで水面から下は accent-fill べた塗り＋on-accent の文字、上は薄い地＋accent-line
 *   の文字にして、文字が必ずどちらか片方の上に乗るようにしている。
 *   → 同じ面を2枚重ね、下の面（flood）を水位で clip-path して切っている。
 *
 * ★ 情報を色だけに持たせない（DESIGN.md §2.5）。水位＝高さ（形）と、
 *   満タンでの文字の太さ・色の3つで二重化している。読み上げには aria-label で
 *   残り回数をそのまま渡す。
 *
 * 5回目だけ一段強い演出を出す（pop が強い・輪が2重・粒子16個・粒が5つ立ちのぼる）。
 * 1回目から粒子は出るので、1回で終わってもしょぼくならない。
 *
 * ★ 押した回数は「押した時点で」決める（人間の指摘 2026-08-27）。
 *   サーバの返事（モックでは 520ms）を待ってから演出の強さを決めていたので、
 *   5回目の合図は pop が終わりかけてから始まり、一瞬しか見えなかった。
 *   水位も同じ数から作る。片方だけ先に進むと「満タンの合図が出たのに地が満ちていない」
 *   ズレになる。返事が届くとサーバの値が追いつくので、見込みは自然に消える。
 *
 * 行は右寄せ（人間の決定、2026-08-25）。DESIGN.md §0.2 は「1種のときは左寄せ」と
 * 書いているが、PC 3カラムでは押しやすい側に寄せるという判断。§0.2 の改訂案は別途出す。
 */

const REACTION_ICON = {
  ogya: IconOgya,
  yoshiyoshi: IconYoshiyoshi,
  manma: IconManma,
  babu: IconBabu,
} as const;

/** 粒子の最大数。実際に見せる数は data-step から CSS 側で絞る */
const BURST_PARTICLES = 16;

/** 5回目に立ちのぼる粒の数。ずらして上げるので、合図の長さもこの数で決まる */
const CHEER_DROPS = 5;

/**
 * 押したあと、サーバの返事を待つ上限。
 *
 * これは動きの長さ（DESIGN.md §7.1 のトークン）ではなく「見込みを捨てる」までの時間。
 * サーバが押下を弾いたとき（max_reached など）でも、ここで必ずサーバの値に戻る。
 */
const PENDING_TIMEOUT_MS = 2000;

/** いま演出を出している1つ。step は「押した結果の回数」で、演出の強さを決める */
type Popping = {
  readonly reaction: ReactionType;
  readonly step: number;
};

/** 押した結果こうなるはず、という回数（種類ごと）。サーバが追いつくまでの見込み */
type Expected = Partial<Record<ReactionType, number>>;

type ReactionRowProps = {
  readonly targetKind: ReactionTargetKind;
  readonly state: ReactionState;
  readonly onReact: (reaction: ReactionType) => void;
  /** あやすの中に置くときは一段小さくする */
  readonly compact?: boolean;
  /** 自分のバブル・自分のあやす。押せるボタンを出さず、付いた数だけを見せる */
  readonly readOnly?: boolean;
};

/**
 * ボタンの中身（アイコン・ラベル・数）。
 * 水面の上と下で同じものを2枚重ねるので、並びは1か所にまとめておく。
 *
 * ★ アイコンとラベルを __main でくくってある（人間の指摘 2026-08-28）。
 *   狭い画面では数だけを2段目に降ろすので、「1段目になるもの」を
 *   1つの箱にしておく必要がある。flex-wrap ＋ flex-basis:100% で折り返す手も
 *   あるが、__face は shrink-to-fit（幅が未定）なので % の basis が
 *   content に落ちて折り返らないことがある。段は入れ子で作るほうが確実。
 */
function ReactionFace({
  reaction,
  count,
}: {
  readonly reaction: ReactionType;
  readonly count: number;
}) {
  const Icon = REACTION_ICON[reaction];
  return (
    <>
      <span className="eg-reaction__main">
        <Icon className="eg-reaction__icon" />
        <span className={cx("eg-reaction__label", "t-label")}>{REACTION_LABEL[reaction]}</span>
      </span>
      {count > 0 ? <span className={cx("eg-reaction__count", "t-counter")}>{count}</span> : null}
    </>
  );
}

export function ReactionRow({
  targetKind,
  state,
  onReact,
  compact = false,
  readOnly = false,
}: ReactionRowProps) {
  const [popping, setPopping] = useState<Popping | null>(null);
  /*
   * 水位の見込み。演出は同時に1つでも、押した見込みは種類ごとに持つ。
   * 1つしか持たないと、おぎゃー→よしよしと続けて押したとき、
   * 先に押したほうの水位が返事を待つあいだ空に戻ってしまう。
   */
  const [expected, setExpected] = useState<Expected>({});

  /*
   * 見込みの後片付け。
   *
   * ★ animationend では外さない（以前はそうしていた）。
   *   1. 中の要素（粒子・輪・立ちのぼる粒）の animationend もここへ上がってくるので、
   *      いちばん先に終わったものが演出を途中で切る
   *   2. 連続で押すと pop は走ったままなので、最後の押下より早く終わりが来る
   *   演出は長いものでも 660ms（粒の最後）で終わる。data-step が残っていても、
   *   終わった animation は流れ直さないので害が無い。
   *   水位はサーバの返事が届いた時点で見込みと同じ値になるので、
   *   ここで外しても画面は動かない。返事が来なかったときだけ、時間で見込みを捨てる。
   */
  useEffect(() => {
    if (popping === null) {
      return;
    }
    /* popping は押すたびに作り直すので、この effect が最後の押下からの時計になる */
    const timer = window.setTimeout(() => {
      setPopping(null);
      setExpected({});
    }, PENDING_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [popping]);

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
        {received.map((reaction) => (
          <li key={reaction}>
            <span className={cx("eg-reaction", "eg-reaction--readonly")}>
              <span className="eg-reaction__face">
                <ReactionFace reaction={reaction} count={state.counts[reaction] ?? 0} />
              </span>
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className={cx("eg-reactions", compact && "eg-reactions--compact")}>
      {REACTIONS_BY_TARGET[targetKind].map((reaction) => {
        /*
         * 押したのに、まだサーバの数に出ていないぶん。
         * 水位・数・押せるかどうかを、この見込みを足した数で決める。
         * サーバが追いつくと 0 になるので、二重に数えることはない。
         */
        const pending = Math.max(0, (expected[reaction] ?? 0) - (state.mine[reaction] ?? 0));
        const count = (state.counts[reaction] ?? 0) + pending;
        const mine = (state.mine[reaction] ?? 0) + pending;
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
              /* 水位。0〜5 をそのまま渡し、高さと地の濃さは CSS 側で決める */
              data-mine={String(mine)}
              data-step={popping?.reaction === reaction ? String(popping.step) : undefined}
              onClick={() => {
                /* 押した結果の回数。サーバの返事を待たずにここで決める */
                const step = Math.min(mine + 1, REACTION_MAX_PER_USER);
                setExpected((current) => ({ ...current, [reaction]: step }));
                setPopping({ reaction, step });
                onReact(reaction);
              }}
            >
              {/* 水面より上。薄い地の上の accent-line */}
              <span className="eg-reaction__face">
                <ReactionFace reaction={reaction} count={count} />
              </span>

              {/*
                水面より下。accent-fill べた塗りの上の on-accent。
                同じ中身を重ねて、水位ぶんだけ clip-path で見せている。
                読み上げには上の面だけを渡す。
              */}
              <span className="eg-reaction__flood" aria-hidden="true">
                <ReactionFace reaction={reaction} count={count} />
              </span>

              {/* 粒子。数は回数で増える。reduced-motion では出さない（DESIGN.md §7.5） */}
              <span className="eg-burst" aria-hidden="true">
                {Array.from({ length: BURST_PARTICLES }, (_, index) => (
                  <span key={index} />
                ))}
              </span>

              {/* 5回目だけ、満タンの合図に粒が立ちのぼる */}
              <span className="eg-reaction__spark" aria-hidden="true">
                {Array.from({ length: CHEER_DROPS }, (_, index) => (
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
