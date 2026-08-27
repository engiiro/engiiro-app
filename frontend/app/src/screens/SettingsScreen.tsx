import { useId, useState } from "react";

import { cx } from "../lib/cx";
import { THEME_CHOICES, THEME_LABEL } from "../lib/useTheme";
import type { ThemeChoice } from "../lib/useTheme";
import { useResolvedTheme } from "../lib/useResolvedTheme";
import { IconCheck, IconChevronRight } from "../components/icons";
import { NoteBox } from "../components/NoteBox";
import { ScreenHeader } from "../components/ScreenHeader";
import "./SettingsScreen.css";

/*
 * せってい（人間の指示、2026-08-27）。
 *
 * ★ この画面は docs/design_doc.md §4.1 の画面一覧（S1〜S8）に無い。
 *   中身を勝手に増やさず、**すでに決まっていること**だけを置く。
 *   置いたのはテーマの切り替え。DESIGN.md §8.3 が実装契約まで決めている、
 *   この画面で唯一「利用者が選ぶ」と決まっている設定だから。
 *
 * ★ 仕様が決まっていないもの（おしらせの置き場所・なまえの変更）は、
 *   押せる行にしない。押せる形にすると「あるのに動かない」に見える。
 *
 * ★ 通報・DM・フォロワー数の項目は作らない。0 を返すのではなく存在させない（16章 非スコープ）。
 *
 * テーマの見本は、その色そのもので見せる。
 * 見本の枠に data-theme を置くと、tokens/theme.css の入れ子側のブロックが効いて、
 * 選んでいないテーマの色でも描ける（theme.css の ★ 参照）。
 */

/** テーマごとの一行説明。ラベル（THEME_LABEL）だけでは何が変わるか分からない */
const THEME_NOTE: Readonly<Record<ThemeChoice, string>> = {
  system: "おつかいの 端末に あわせます",
  normal: "あかるい 地に 臙脂",
  dark: "よぞらの 色。暗くても まぶしくない",
  kid: "こうさく用紙みたいに あざやか",
};

/*
 * 仕様の説明。ここに書いてよいのは、すでに決まっていることの言いかえだけ。
 * 新しい約束をこの画面で作らない。
 */
const ABOUT: readonly { readonly title: string; readonly lines: readonly string[] }[] = [
  {
    title: "なまえと ひみつのこと",
    lines: [
      "あなたの 赤ちゃんと お母さんが 同じ人だとは、ほかの人には 分かりません。",
      "本名・会社や学校の名前・れんらく先・URL・待ち合わせの約束は、本文に 書けません。",
      "ことばの お手伝いには、だれが書いたのかを わたしていません。",
    ],
  },
  {
    title: "作っていない ものの こと",
    lines: [
      "だれが あなたを 大好きに したかは、あなたにも 見せません。",
      "1対1で やりとりする メッセージは ありません。",
      "お母さんからは バブルを 出せません。あやすだけ できます。",
    ],
  },
];

/** まだ決まっていないもの。押せる行にしない */
const SOON: readonly { readonly title: string; readonly note: string }[] = [
  { title: "おしらせ", note: "どこに 出すか まだ 決めていません" },
  { title: "なまえの 変更", note: "これから つくります" },
];

export function SettingsScreen({
  theme,
  onThemeChange,
}: {
  readonly theme: ThemeChoice;
  readonly onThemeChange: (next: ThemeChoice) => void;
}) {
  /*
   * 「OSに従う」の見本だけは、選択そのものでは色が決まらない。
   * いま実際に出ている側（ノーマル／ダーク）を見せる。
   */
  const resolved = useResolvedTheme();

  return (
    <>
      <ScreenHeader title="せってい" />

      <div className={cx("eg-column", "eg-settings")}>
        <NoteBox title="ここで えらぶ こと">
          えらんだ みための せっていは、この端末にだけ のこります。ほかの人には 見えません。
        </NoteBox>

        <section className="eg-settings__section">
          <h2 className={cx("eg-settings__title", "t-heading")}>みため</h2>
          <p className={cx("eg-settings__lead", "t-caption")}>
            えらぶと すぐ 切りかわります。見本は そのテーマの 色で 出しています。
          </p>

          <ul className="eg-theme-list">
            {THEME_CHOICES.map((choice) => {
              const current = theme === choice;
              return (
                <li key={choice}>
                  <button
                    type="button"
                    aria-pressed={current}
                    className={cx("eg-theme-card", "eg-touch", current && "is-current")}
                    onClick={() => onThemeChange(choice)}
                  >
                    {/*
                      見本。この中だけ別のテーマの色になる。
                      形（枠の太さ・角）もテーマで変わるので、色見本ではなく小さな画面にしている。
                    */}
                    <span
                      className="eg-theme-card__preview"
                      data-theme={choice === "system" ? resolved : choice}
                      aria-hidden="true"
                    >
                      <span className="eg-theme-card__bubble" />
                      <span className="eg-theme-card__row">
                        <span className="eg-theme-card__pill" />
                        <span className="eg-theme-card__dot" />
                      </span>
                    </span>

                    <span className="eg-theme-card__head">
                      <span className={cx("eg-theme-card__label", "t-label")}>
                        {THEME_LABEL[choice]}
                      </span>
                      {/* いま これ、を色だけで示さない（DESIGN.md §2.5） */}
                      {current ? (
                        <span className={cx("eg-theme-card__mark", "t-caption")}>
                          <IconCheck />
                          いま これ
                        </span>
                      ) : null}
                    </span>

                    <span className={cx("eg-theme-card__note", "t-caption")}>
                      {THEME_NOTE[choice]}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {/*
            動きの量は端末側の設定に従う（DESIGN.md §7.5）。
            アプリ側に同じスイッチを作ると、どちらが勝つのか分からなくなる。
          */}
          <p className={cx("eg-settings__lead", "t-caption")}>
            動きの量は、端末の「動きを へらす」設定に あわせます。
          </p>
        </section>

        <section className="eg-settings__section">
          <h2 className={cx("eg-settings__title", "t-heading")}>このアプリの こと</h2>
          {ABOUT.map((item) => (
            <Disclosure key={item.title} title={item.title} lines={item.lines} />
          ))}
        </section>

        <section className="eg-settings__section">
          <h2 className={cx("eg-settings__title", "t-heading")}>これから つくります</h2>
          <ul className="eg-settings__soon">
            {SOON.map((item) => (
              <li key={item.title} className="eg-settings__soon-row">
                <span className={cx("eg-settings__soon-title", "t-body")}>{item.title}</span>
                <span className={cx("eg-settings__soon-note", "t-caption")}>{item.note}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

/**
 * ひらいて読む1項目。
 * 押せる行に見せるのは、実際に開く行だけ。行き先の無い `>` を並べない。
 */
function Disclosure({
  title,
  lines,
}: {
  readonly title: string;
  readonly lines: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();

  return (
    <div className={cx("eg-disclose", open && "is-open")}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        className={cx("eg-disclose__head", "eg-touch")}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={cx("eg-disclose__title", "t-body")}>{title}</span>
        <IconChevronRight className="eg-disclose__chevron" />
      </button>

      {/*
        閉じているときも DOM に置いたまま hidden で隠す。
        消してしまうと aria-controls の指す先が無くなる。
      */}
      <ul id={bodyId} className="eg-disclose__body" hidden={!open}>
        {lines.map((line) => (
          <li key={line} className={cx("eg-disclose__line", "t-body")}>
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}
