import { useState } from "react";
import type { ReactElement } from "react";

import { cx } from "../lib/cx";
import { Button } from "../components/Button";
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
      <div className="eg-intro__sheet">
        <header className="eg-intro__head">
          <p className={cx("eg-intro__brand", "t-display")}>えんじいろ</p>
          <button type="button" className={cx("eg-intro__skip", "t-label")} onClick={onSkip}>
            とばして 登録へ
          </button>
        </header>

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
  );
}
