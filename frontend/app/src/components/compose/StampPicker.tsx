import { stampGroups } from "../../data/stampCatalog";
import { cx } from "../../lib/cx";
import { SegmentedTabs } from "../SegmentedTabs";
import { StampGlyph } from "../BubbleBody";

/*
 * スタンプ一覧（FR-STAMP-001）。棚に分けたのは人間の指示（2026-08-27）、
 * 絵を入れたのも人間の指示（2026-08-28）。
 *
 * ★ 棚の並びとラベルは data/stampCatalog.ts が持つ。ここで並べ直さない。
 * ★ タブは SegmentedTabs の横に流す変種。ここ用のタブを新しく作らない
 *   （DESIGN.md §4：画面ごとに似て非なるタブを作らない）。
 * ★ 押すと本文には目印の文字が入る。絵になるのは出したあとなので、
 *   呼び出し側の ComposePanel が入力欄の下に「こう 出ます」を出している。
 */
export function StampPicker({
  emotion,
  onEmotionChange,
  full,
  onPick,
}: {
  readonly emotion: string;
  readonly onEmotionChange: (next: string) => void;
  readonly full: boolean;
  readonly onPick: (id: string) => void;
}) {
  const groups = stampGroups();
  if (groups.length === 0) {
    return <p className={cx("t-body", "eg-drawer__note")}>スタンプを 読み込めませんでした。</p>;
  }
  /* 読み込みより先に選ばれていることがある。無い棚なら先頭に落とす */
  const current = groups.find((group) => group.key === emotion) ?? groups[0];

  return (
    <div className="eg-stamps">
      <SegmentedTabs
        tabs={groups.map((group) => ({ value: group.key, label: group.label }))}
        current={current.key}
        onChange={onEmotionChange}
        panelId="eg-stamp-panel"
        label="スタンプの たな"
        variant="scroll"
      />

      <div
        id="eg-stamp-panel"
        role="tabpanel"
        aria-labelledby={"eg-stamp-panel-tab-" + current.key}
        className="eg-stamp-grid"
      >
        {current.stamps.map((stamp) => (
          <button
            key={stamp.id}
            type="button"
            disabled={full}
            /*
              図と名前は見るためのもの。読み上げには「入れる」という操作を渡す。
              aria-label を置くと中の文字は読み上げの名前に使われないので、
              「ねむいのスタンプ ねむい」と二重に読まれない。
            */
            aria-label={stamp.name + " を 本文に 入れる"}
            className={cx("eg-stamp-pick", "eg-touch")}
            onClick={() => onPick(stamp.id)}
          >
            <StampGlyph id={stamp.id} picker />
            <span className={cx("eg-stamp-pick__name", "t-caption")}>{stamp.name}</span>
          </button>
        ))}
      </div>

      <p className={cx("eg-stamps__hint", "t-caption")}>
        {full
          ? "150文字に なったので、これ以上 入れられません。"
          : "カーソルの ある ところに 入ります。絵1つで 1文字ぶん。"}
      </p>
    </div>
  );
}
