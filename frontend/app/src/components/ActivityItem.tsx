import type { MyActivityItem } from "../data/types";
import { cx } from "../lib/cx";
import { relativeTimeText } from "../lib/relativeTime";
import { BubbleBody } from "./BubbleBody";
import { PersonaAvatar } from "./PersonaAvatar";
import { IconTrash } from "./icons";
import "./ActivityItem.css";

/*
 * プロフィールの一覧に並ぶ1件（人間の指示、2026-08-25 のモック）。
 *
 * バブルとあやすが同じ列に混ざるので、種別を文字で示す。
 * あやすには「どのバブルへのものか」の抜粋を添える。相手のニックネームは出さない
 * （一覧に他人のペルソナが並ぶと、そこから辿れる面が増える）。
 *
 * ★ 時刻は相対表示（DESIGN.md §0.1-5）。
 *   モックには「2024/05/10 10:30」と絶対時刻が入っているが、秒精度の絶対時刻は
 *   2つのペルソナの投稿時刻を突き合わせる材料になるため、ここでは採っていない。
 *   採否は人間の判断が要る（この件は PR に書く）。
 *
 * 本文の URL を自動リンク化しない（FR-MOD-021 / OUT-008）。BubbleBody に任せる。
 */

type ActivityItemProps = {
  readonly item: MyActivityItem;
  readonly onOpen: (bubbleId: string) => void;
  /** 自分のバブルにだけ渡る。あやすの削除は仕様に無いので口を作っていない（FR-POST-006） */
  readonly onDelete?: (bubbleId: string) => void;
};

const KIND_LABEL = { bubble: "バブル", soothe: "あやす" } as const;

export function ActivityItem({ item, onOpen, onDelete }: ActivityItemProps) {
  const isBubble = item.kind === "bubble";
  const entry = isBubble ? item.bubble : item.soothe;
  const bubbleId = isBubble ? item.bubble.id : item.soothe.bubbleId;

  return (
    <li className={cx("eg-activity", "is-" + entry.author.kind)}>
      <div className="eg-activity__head">
        <PersonaAvatar kind={entry.author.kind} size="sm" />
        <span className={cx("eg-activity__name", "t-card-title")}>{entry.author.nickname}</span>
        <span className={cx("eg-activity__kind", "t-label", "is-" + entry.author.kind)}>
          {KIND_LABEL[item.kind]}
        </span>
        <span className={cx("eg-activity__time", "t-caption")}>
          {relativeTimeText(entry.createdAt)}
        </span>
        {isBubble && onDelete ? (
          <button
            type="button"
            className={cx("eg-activity__delete", "eg-touch")}
            onClick={() => onDelete(item.bubble.id)}
            aria-label="このバブルを けす"
          >
            <IconTrash />
          </button>
        ) : null}
      </div>

      {item.kind === "soothe" ? (
        <p className={cx("eg-activity__to", "t-caption")}>
          「{item.toBubbleExcerpt}」へ
        </p>
      ) : null}

      <button type="button" className="eg-activity__open" onClick={() => onOpen(bubbleId)}>
        <BubbleBody body={entry.body} className="eg-activity__body" as="span" />
      </button>
    </li>
  );
}
