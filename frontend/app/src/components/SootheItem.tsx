import { reactionTargetOfSoothe } from "../data/reactions";
import type { ReactionType, Soothe } from "../data/types";
import { cx } from "../lib/cx";
import { REPLY_WORDING, replyKindOfSoothe } from "../lib/replyWording";
import { sootheCountText } from "../lib/sootheCountText";
import { BubbleBody } from "./BubbleBody";
import { PersonaChip } from "./PersonaChip";
import { ReactionRow } from "./ReactionRow";
import "./SootheItem.css";

/*
 * あやす1件（DESIGN.md §0.2）。
 *
 * ★ リアクション行の中身は、あやすの発信ペルソナだけで決まる：
 *     赤ちゃんとしてのあやす → おぎゃー・よしよし・まんま の3種
 *     お母さんとしてのあやす → ばぶー の1種のみ
 *   ここで種類を選び直さない。reactionTargetOfSoothe に渡すだけ。
 *
 * 発信者から、同一アカウントのもう一方のペルソナを特定できる情報を出さない（FR-COMMENT-004）。
 *
 * ★ 返す操作の呼び名は、このあやすの発信ペルソナで変わる（人間の決定 2026-08-28）。
 *     赤ちゃんとしてのあやす → 「あやす」（どちらの顔でも返せる）
 *     お母さんとしてのあやす → 「バブる」（赤ちゃんしか返せない。FR-COMMENT-005）
 *   件数の一行も同じ規則で「あやす 3」／「バブル 3」に変わる。
 *   ことばの表は lib/replyWording.ts。ここでは引くだけで、文をここに書かない。
 *
 * ★ 本文を押すと、そのあやすの詳細が開く（人間の指示、2026-08-26）。
 *   当たり判定の作りはバブルカードと同じ：擬似要素を1件の全面に敷き、
 *   手前に出したい操作（ニックネーム・リアクション・あやす）だけ z-index で上げる。
 *   バブルと同じ触り心地にするのが目的なので、ここだけ別の作法にしない。
 */

type SootheItemProps = {
  readonly soothe: Soothe;
  /** ニックネームから S6 公開プロフィールへ */
  readonly onOpenProfile: (personaId: string) => void;
  readonly onReact: (sootheId: string, reaction: ReactionType) => void;
  readonly onReply: (soothe: Soothe) => void;
  /** 本文を押したとき。あやす詳細（誰があやしているかの一覧）へ */
  readonly onOpen: (soothe: Soothe) => void;
};

export function SootheItem({
  soothe,
  onOpenProfile,
  onReact,
  onReply,
  onOpen,
}: SootheItemProps) {
  const wording = REPLY_WORDING[replyKindOfSoothe(soothe.author.kind)];

  return (
    <li className={cx("eg-soothe", "is-" + soothe.author.kind)}>
      <div className="eg-soothe__head">
        <PersonaChip
          persona={soothe.author}
          createdAt={soothe.createdAt}
          compact
          onOpenProfile={onOpenProfile}
        />
      </div>

      {/* 1件のなかで focus できる主役はこの1つ。中身は phrasing content だけにしてある */}
      <button type="button" className="eg-soothe__open" onClick={() => onOpen(soothe)}>
        <BubbleBody body={soothe.body} className="eg-soothe__body" as="span" />
        <span className={cx("eg-soothe__count", "t-caption")}>
          {sootheCountText(soothe.replyCount, replyKindOfSoothe(soothe.author.kind))}
        </span>
      </button>

      <div className="eg-soothe__foot">
        <ReactionRow
          targetKind={reactionTargetOfSoothe(soothe.author.kind)}
          state={soothe.reactions}
          onReact={(reaction) => onReact(soothe.id, reaction)}
          compact
          readOnly={soothe.isMine}
        />
        <button
          type="button"
          className={cx("eg-soothe__reply", "t-label", "eg-touch")}
          onClick={() => onReply(soothe)}
        >
          {wording.action}
        </button>
      </div>
    </li>
  );
}
