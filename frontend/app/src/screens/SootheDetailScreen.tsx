import { reactionTargetOfSoothe } from "../data/reactions";
import type { ReactionType, Soothe, SootheDetail } from "../data/types";
import { cx } from "../lib/cx";
import { REPLY_WORDING, replyKindOfSoothe } from "../lib/replyWording";
import type { SootheTarget } from "../lib/soothePersonaRule";
import { BottomAction, BottomActionNote } from "../components/BottomAction";
import { BubbleBody } from "../components/BubbleBody";
import { Button } from "../components/Button";
import { NoSootheState } from "../components/EmptyState";
import { IconPen, IconSoothe } from "../components/icons";
import { PersonaChip } from "../components/PersonaChip";
import { ReactionRow } from "../components/ReactionRow";
import { ScreenHeader } from "../components/ScreenHeader";
import { SootheItem } from "../components/SootheItem";
import "./SootheDetailScreen.css";

/*
 * S4b あやす詳細（人間の指示、2026-08-26）。
 *
 * 「あやすに対して あやしている人たち」を一覧で見る画面。
 * これまで、あやすへの返信はバブル詳細に平らに混ざっていて、
 * 何件ついているのかも、誰への返事なのかも読めなかった。
 *
 * 作りはバブル詳細（S4）とそろえてある。主役＝上のあやす1件、その下に一覧、
 * 下端に「あやす」。同じものは同じ形にする。ここだけ別の触り心地にしない。
 *
 * ★ 返信できるペルソナの規則は変わらない（FR-COMMENT-005/006）。
 *   お母さんとしてのあやすへ返すときは赤ちゃんだけ。判定は soothePersonaRule が持っていて、
 *   この画面は SootheTarget を組み立てて渡すだけ。ここで選び直さない。
 *
 * ★ その場合、下端の操作は「あやす」ではなく「バブる」になる（人間の決定 2026-08-28）。
 *   赤ちゃんしか返せない場面で「あやす」と書くのは、操作の主体と意味が合っていなかった。
 *   見出し・空状態・ボタン・アイコンが lib/replyWording.ts の同じ1行から決まる。
 *
 * ★ 元のバブルは「抜粋」だけ出す。発信者は出さない。
 *   この画面の主役はあやすで、バブルの発信者まで並べると、1画面に載る人が増える。
 *   バブルそのものを読みたければ、抜粋を押してバブル詳細へ移る。
 *
 * 置いていないもの：あやすの削除（仕様に無い。FR-POST-006 はバブルのみ）、
 * 返信の連鎖をさかのぼる導線（1階層ずつ開く）。
 */

type SootheDetailScreenProps = {
  readonly detail: SootheDetail;
  readonly onBack: () => void;
  readonly onOpenProfile: (personaId: string) => void;
  readonly onOpenBubble: (bubbleId: string) => void;
  readonly onOpenSoothe: (sootheId: string) => void;
  readonly onReact: (
    sootheId: string,
    authorKind: Soothe["author"]["kind"],
    reaction: ReactionType,
  ) => void;
  readonly onReply: (target: SootheTarget) => void;
};

export function SootheDetailScreen({
  detail,
  onBack,
  onOpenProfile,
  onOpenBubble,
  onOpenSoothe,
  onReact,
  onReply,
}: SootheDetailScreenProps) {
  const { soothe, replies, bubbleIsMine } = detail;

  /* この主役のあやすへ「返す」操作の呼び名。発信ペルソナだけで決まる */
  const replyKind = replyKindOfSoothe(soothe.author.kind);
  const wording = REPLY_WORDING[replyKind];

  /** 一覧の1件、または主役のあやすを返信先にする */
  function targetOf(item: Soothe): SootheTarget {
    return {
      kind: "soothe",
      bubbleId: detail.bubbleId,
      sootheId: item.id,
      authorKind: item.author.kind,
      authorNickname: item.author.nickname,
      bubbleIsMine,
    };
  }

  return (
    <>
      <ScreenHeader title="あやす" onBack={onBack} />

      <div className={cx("eg-column", "eg-soothe-detail")}>
        {/* もとのバブルへ戻る道。抜粋だけで、発信者は出さない */}
        <button
          type="button"
          className={cx("eg-soothe-detail__source", "t-caption", "eg-touch")}
          onClick={() => onOpenBubble(detail.bubbleId)}
        >
          「{detail.bubbleExcerpt}」へのあやす
        </button>

        <article className={cx("eg-soothe-detail__main", "is-" + soothe.author.kind)}>
          <PersonaChip
            persona={soothe.author}
            createdAt={soothe.createdAt}
            onOpenProfile={onOpenProfile}
          />

          {detail.replyToNickname ? (
            <p className={cx("eg-soothe-detail__quote", "t-caption")}>
              {detail.replyToNickname} へ
            </p>
          ) : null}

          <BubbleBody body={soothe.body} className="eg-soothe-detail__body" />

          <div className="eg-soothe-detail__reactions">
            <ReactionRow
              targetKind={reactionTargetOfSoothe(soothe.author.kind)}
              state={soothe.reactions}
              onReact={(reaction) => onReact(soothe.id, soothe.author.kind, reaction)}
              readOnly={soothe.isMine}
            />
          </div>
        </article>

        <section className="eg-soothe-detail__replies" aria-labelledby="eg-replies-title">
          <h2 id="eg-replies-title" className={cx("eg-soothe-detail__replies-title", "t-heading")}>
            {wording.listTitle}
            {replies.length > 0 ? (
              <span className={cx("eg-soothe-detail__count", "t-counter")}>{replies.length}</span>
            ) : null}
          </h2>

          {replies.length === 0 ? (
            <NoSootheState kind={replyKind} />
          ) : (
            <ul className="eg-soothe-detail__list">
              {replies.map((reply) => (
                <SootheItem
                  key={reply.id}
                  soothe={reply}
                  onOpenProfile={onOpenProfile}
                  onReact={(sootheId, reaction) => onReact(sootheId, reply.author.kind, reaction)}
                  onReply={(item) => onReply(targetOf(item))}
                  onOpen={(item) => onOpenSoothe(item.id)}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      <BottomAction>
        {/*
          誰へ、どの顔で返すのかを先に書く。お母さんへのあやすには赤ちゃんとしてしか
          返せないので（FR-COMMENT-005）、押してから選択肢が減っている理由が分かる
          状態にしない。呼び名も「バブる」に変わるので、それもここで先に見せる。
        */}
        <BottomActionNote>
          {replyKind === "bubble"
            ? soothe.author.nickname + " の あやすへ 赤ちゃんとして バブります"
            : soothe.author.nickname + " の あやすへ あやします"}
        </BottomActionNote>
        <Button fullWidth onClick={() => onReply(targetOf(soothe))}>
          {replyKind === "bubble" ? <IconPen /> : <IconSoothe />}
          {wording.action}
        </Button>
      </BottomAction>
    </>
  );
}
