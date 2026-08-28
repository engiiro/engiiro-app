import { useState } from "react";
import type { ReactElement } from "react";

import { cx } from "../lib/cx";
import { BrandMark } from "../components/BrandMark";
import { Button } from "../components/Button";
import { Illustration } from "../components/Illustration";
import { PersonaAvatar } from "../components/PersonaAvatar";
import { IconBabu, IconManma, IconOgya, IconShield, IconYoshiyoshi } from "../components/icons";
import "./IntroScreen.css";

/*
 * 登録の前に読む説明（人間の指示、2026-08-25）。「簡単な取説」。
 *
 * ★ この画面はサーバへ何も送らない。読んだかどうかも記録しない。
 *   backend にも仕様にも影響を出さないための決まりで、
 *   ここに「同意しました」の類を持たせない（持たせた時点で保存するものが増える）。
 *
 * 書いてあるのは、このサービスで**先に知らないと戸惑うところ**だけ：
 *   1. ふたつの顔を同時に持つ（FR-ACCOUNT-001）
 *   2. その2つが同じ人だと誰にも分からない（FR-PERSONA-003/004）
 *   3. 書けることが顔によって違う（FR-POST-003 / FR-COMMENT-005〜007）
 *   4. 守るための決まり（FR-MOD-010 / FR-REACT-008 / OUT-004）
 *
 * 機能の一覧にしない。読み終わったあとに「自分が何をされないか」が分かる形にする。
 *
 * ★ 見た目は「表紙」（UI刷新 2026-08-26）。
 *   左（広い画面）／上（狭い画面）にイラストと名乗りを固定で置き、
 *   右（下）のカードだけがページごとに入れ替わる。
 *   イラストは soft-bubble-orbit ＝「めぐるバブル」。
 *   吐き出したものが誰かに受け止められて、またこちらへ戻ってくるという、
 *   このサービスの一番の主張をそのまま絵にしたものを主役に置いた。
 *   ページを送っても絵は動かないので、視線の落ち着き先が変わらない。
 */

type Step = {
  readonly id: string;
  readonly title: string;
  readonly lines: readonly string[];
  readonly figure: ReactElement;
};

const STEPS: readonly Step[] = [
  {
    id: "two-faces",
    title: "ふたつの顔で すごします",
    lines: [
      "えんじいろでは、ひとりが ふたつの顔を もちます。",
      "赤ちゃんの顔は、よわねを 吐き出すため。",
      "お母さんの顔は、だれかを あやすため。",
      "登録すると、この ふたつが いっしょに できます。",
    ],
    figure: (
      <div className="eg-intro__faces">
        <div className="eg-intro__face">
          <PersonaAvatar kind="baby" size="lg" />
          <span className={cx("eg-intro__face-label", "t-label", "is-baby")}>赤ちゃん</span>
          <span className={cx("eg-intro__face-note", "t-caption")}>よわねを 吐き出す</span>
        </div>
        <div className="eg-intro__face">
          <PersonaAvatar kind="mother" size="lg" />
          <span className={cx("eg-intro__face-label", "t-label", "is-mother")}>お母さん</span>
          <span className={cx("eg-intro__face-note", "t-caption")}>だれかを あやす</span>
        </div>
      </div>
    ),
  },
  {
    id: "not-linked",
    title: "その ふたつが 同じ人だとは、だれにも わかりません",
    lines: [
      "ニックネームは べつべつ。ならべて 出る画面は ありません。",
      "だれかの ページから、その人の もう一方の顔へ 行くこともできません。",
      "ふたつを いっしょに 見られるのは、あなたの マイプロフィールだけです。",
      "だから、お母さんの顔で だれかを あやしても、",
      "赤ちゃんの顔で 弱音を はいていることは 知られません。",
    ],
    figure: (
      <div className="eg-intro__linkage">
        <PersonaAvatar kind="baby" size="lg" />
        <span className={cx("eg-intro__cut", "t-label")} aria-hidden="true">
          つながらない
        </span>
        <PersonaAvatar kind="mother" size="lg" />
      </div>
    ),
  },
  {
    id: "who-can-do-what",
    title: "顔によって、できることが ちがいます",
    lines: [
      "バブル（よわねの投稿）を かけるのは 赤ちゃんの顔だけ。",
      "あやす（返事）は どちらの顔でも できます。",
      "ただし、お母さんの あやすに、お母さんの顔では 返せません。",
      "そこは 赤ちゃんの顔だけです。",
    ],
    figure: (
      <div className="eg-intro__reactions">
        <span className={cx("eg-intro__chip", "t-label")}>
          <IconOgya />
          おぎゃー
        </span>
        <span className={cx("eg-intro__chip", "t-label")}>
          <IconYoshiyoshi />
          よしよし
        </span>
        <span className={cx("eg-intro__chip", "t-label")}>
          <IconManma />
          まんま
        </span>
        <span className={cx("eg-intro__chip", "is-mother", "t-label")}>
          <IconBabu />
          ばぶー
        </span>
      </div>
    ),
  },
  {
    id: "safety",
    title: "守るための やくそく",
    lines: [
      "名前・住んでいる場所・連絡先・会う約束は 書けません。",
      "あなた自身のことでも 書けません。だれかに 見つけられないためです。",
      "だれかを 責める ボタンは ありません。つくっていません。",
      "「大好き」は 一方通行。何人に 大好きされたかは、あなたにも 出ません。",
      "見られている 気持ちに ならずに いられるように しています。",
    ],
    figure: (
      <div className="eg-intro__shield">
        <IconShield className="eg-intro__shield-icon" />
      </div>
    ),
  },
];

export function IntroScreen({
  onStart,
  onSkip,
}: {
  readonly onStart: () => void;
  readonly onSkip: () => void;
}) {
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;

  return (
    <div className="eg-intro">
      <div className="eg-intro__stage">
        {/*
          表紙側。ページを送っても中身が変わらないので、視線の落ち着き先になる。
          イラストは装飾ではなく、この画面の主役として置いている。
        */}
        <div className="eg-intro__cover">
          {/*
            狭い画面ではイラストと文字が横に並び、960px 以上では縦に積む。
            並び替えは CSS の order だけで行い、読み上げの順序は
            名乗り → ひとこと → 絵（装飾）のまま変えない。
          */}
          <div className="eg-intro__cover-text">
            <div className="eg-intro__brandline">
              <BrandMark className="eg-intro__mark" />
              <span className={cx("eg-intro__brand", "t-display")}>えんじいろ</span>
            </div>
            <p className={cx("eg-intro__tagline", "t-body")}>
              よわねを 吐き出すと、
              <br />
              だれかが そっと あやしてくれる。
            </p>
          </div>
          <Illustration name="orbit" className="eg-intro__art" />
        </div>

        {/*
          ★ カードの大きさをページごとに変えない（人間の指示、2026-08-26）。
            伸び縮みすると「つぎへ」が毎回ちがう位置に来て押しにくい。
            高さは CSS 側で固定し、収まらないぶんは中（__body）だけをスクロールさせる。
        */}
        <div className="eg-intro__sheet">
          <div className="eg-intro__sheet-head">
            <p className={cx("eg-intro__step-count", "t-label")}>
              {String(index + 1)} / {String(STEPS.length)}
            </p>
            <button type="button" className={cx("eg-intro__skip", "t-label")} onClick={onSkip}>
              とばして 登録へ
            </button>
          </div>

          {/* key を変えて、めくるたびに文字を出し直す（EmptyState と同じ texts-reveal） */}
          <div key={step.id} className="eg-intro__body">
            <div className="eg-intro__figure">{step.figure}</div>
            <h1 className={cx("eg-intro__title", "t-heading")}>{step.title}</h1>
            <div className="eg-intro__lines">
              {step.lines.map((line, lineIndex) => (
                <p
                  key={line}
                  className={cx("eg-intro__line", "t-body")}
                  style={{
                    animationDelay: "calc(var(--duration-stagger) * " + String(lineIndex) + ")",
                  }}
                >
                  {line}
                </p>
              ))}
            </div>
          </div>

          <div className="eg-intro__foot">
            <ol className="eg-intro__dots">
              {STEPS.map((item, dotIndex) => (
                <li
                  key={item.id}
                  className={cx("eg-intro__dot", dotIndex === index && "is-current")}
                  aria-current={dotIndex === index ? "step" : undefined}
                >
                  {/* 番号は読み上げにだけ渡す。点だけでは何枚目か分からない */}
                  <span className="eg-sr-only">
                    {String(dotIndex + 1)} / {String(STEPS.length)}
                  </span>
                </li>
              ))}
            </ol>

            <div className="eg-intro__actions">
              {index > 0 ? (
                <Button variant="ghost" onClick={() => setIndex(index - 1)}>
                  もどる
                </Button>
              ) : null}
              <Button onClick={isLast ? onStart : () => setIndex(index + 1)}>
                {isLast ? "はじめる" : "つぎへ"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
