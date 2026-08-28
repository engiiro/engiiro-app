import type { Bubble, ReactionType } from "../data/types";
import { cx } from "../lib/cx";
import { sootheCountText } from "../lib/sootheCountText";
import { BubbleBody } from "./BubbleBody";
import { PersonaChip } from "./PersonaChip";
import { ReactionRow } from "./ReactionRow";
import "./BubbleCard.css";

/*
 * バブルカード（DESIGN.md §4 Cards ／ UI刷新 2026-08-26）。
 *
 * ★ 「面」ではなく「吹き出し」として出す。
 *   本文が入った吹き出しがあり、その左下のしっぽの先に、書いた人がいる。
 *   角丸の長方形を縦に並べただけの形をやめたのは、それが一番強く
 *   「よくある SNS」に見えていたから。ことばのほうが先に目に入る並びは、
 *   このサービスが「誰が言ったか」ではなく「何を吐き出したか」の場である、
 *   という立場とも合っている。
 *
 * 視線は 本文 → 書いた人 → リアクション の順。
 * 影は付けない。ホバーで浮かせない。フィードは読み物であってボタンの列ではない。
 *
 * 本文の URL を自動リンク化しない（FR-MOD-021 / OUT-008）。そもそも保存されないので、
 * リンク化の処理そのものを置かない。本文はただのテキストとして出す。
 *
 * ★ 「よんだ／まだ」を出さない（人間の指示、2026-08-27）。
 *   既読は仕様書にも設計書にも無く、送り先の API も無い。
 *   画面だけが覚えている「よんだ」は、別の端末で開けば嘘になるし、
 *   本人にしか意味が無い情報のために1行ぶんの高さを使っていた。
 *   型（Bubble.read）ごと落として、そのぶんカードを詰めている。
 */

type BubbleCardProps = {
  readonly bubble: Bubble;
  /** 並び順。出てくるときのずらしにだけ使う（呼び出し側で頭打ちにする） */
  readonly index?: number;
  readonly onOpen: (bubbleId: string) => void;
  /** ニックネームから S6 公開プロフィールへ */
  readonly onOpenProfile: (personaId: string) => void;
  readonly onReact: (bubbleId: string, reaction: ReactionType) => void;
};

export function BubbleCard({
  bubble,
  index = 0,
  onOpen,
  onOpenProfile,
  onReact,
}: BubbleCardProps) {
  return (
    <article
      className="eg-bubble"
      style={{ animationDelay: "calc(var(--duration-stagger) * " + String(index) + ")" }}
    >
      {/*
        吹き出し全体が「開く」ボタン。
        以前はカード全面に擬似要素を敷いて当たり判定を広げていたが、
        書いた人とリアクションを吹き出しの外へ出したので、その工夫は要らなくなった。
        button の中に button が入らない形になり、作りもそのぶん素直になっている。
      */}
      <button type="button" className="eg-bubble__balloon" onClick={() => onOpen(bubble.id)}>
        <BubbleBody body={bubble.body} className="eg-bubble__body" as="span" />
        <span className={cx("eg-bubble__more", "t-caption")}>
          {sootheCountText(bubble.sootheCount)}
        </span>
      </button>

      <div className="eg-bubble__who">
        <PersonaChip
          persona={bubble.author}
          createdAt={bubble.createdAt}
          showRole={false}
          compact
          onOpenProfile={onOpenProfile}
        />
      </div>

      <footer className="eg-bubble__foot">
        <ReactionRow
          targetKind="bubble"
          state={bubble.reactions}
          onReact={(reaction) => onReact(bubble.id, reaction)}
          readOnly={bubble.isMine}
        />
      </footer>
    </article>
  );
}
