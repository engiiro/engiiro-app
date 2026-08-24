import { EmptyState } from "../components/EmptyState";
import { ScreenHeader } from "../components/ScreenHeader";
import { cx } from "../lib/cx";

/*
 * 準備中の画面。
 *
 * 左サイドの「さがす」「おしらせ」「おきにいり」「プロフィール」「せってい」は、
 * docs/design_doc.md §4.1 の画面一覧（S1〜S8）に無い。
 * 中身を勝手に決めず、場所だけ取っておく。
 *
 * プロフィールについては、S8（本人専用プロフィール）が
 * 「両ペルソナのステータスを同時に見せてよい唯一の画面」（FR-PERSONA-005）なので、
 * 中身を作るときは非連結の扱いに注意が要る。ここでは何も出さない。
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
    favorites: {
      title: "おきにいり",
      lines: ["おきにいりは これから つくります。", "なにを ためておけるかは まだ決まっていません。"],
    },
    profile: {
      title: "プロフィール",
      lines: [
        "プロフィールは これから つくります。",
        "自分の2つのペルソナを まとめて見られる、ただ1つの画面になります。",
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
