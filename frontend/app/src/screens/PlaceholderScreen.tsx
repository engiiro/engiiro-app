import { EmptyState } from "../components/EmptyState";
import { ScreenHeader } from "../components/ScreenHeader";
import { cx } from "../lib/cx";

/*
 * 準備中の画面。
 *
 * 左サイドの「さがす」「おしらせ」「せってい」は、
 * docs/design_doc.md §4.1 の画面一覧（S1〜S8）に無い。
 * 中身を勝手に決めず、場所だけ取っておく。
 *
 * プロフィール（S8）と おきにいり（S7）はここから外れて、
 * MyProfileScreen / FavoritesScreen になった。
 */

const COPY: Readonly<Record<string, { readonly title: string; readonly lines: readonly string[] }>> =
  {
    search: {
      title: "さがす",
      lines: ["さがす機能は これから つくります。", "どんな探し方がいいか、まだ決まっていません。"],
    },
    notifications: {
      title: "おしらせ",
      lines: [
        "おしらせは これから つくります。",
        "いまは 投稿できたことを 画面の下で お知らせしています。",
      ],
    },
    settings: {
      title: "せってい",
      lines: ["せっていは これから つくります。", "テーマの切り替えは いまは上の帯で試せます。"],
    },
  };

export function PlaceholderScreen({ view }: { readonly view: string }) {
  const copy = COPY[view] ?? { title: "準備中", lines: ["この画面は これから つくります。"] };
  return (
    <>
      <ScreenHeader title={copy.title} />
      <div className={cx("eg-placeholder")}>
        <EmptyState lines={copy.lines} />
      </div>
    </>
  );
}
