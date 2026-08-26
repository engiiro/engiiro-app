import { useState } from "react";

import type { BubbleDetail, ReactionType, Soothe } from "../data/types";
import { cx } from "../lib/cx";
import type { SootheTarget } from "../lib/soothePersonaRule";
import { BottomAction } from "../components/BottomAction";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmptyState } from "../components/EmptyState";
import { IconSoothe, IconTrash } from "../components/icons";
import { BubbleBody } from "../components/BubbleBody";
import { PersonaChip } from "../components/PersonaChip";
import { ReactionRow } from "../components/ReactionRow";
import { ScreenHeader } from "../components/ScreenHeader";
import { SootheItem } from "../components/SootheItem";
import "./BubbleDetailScreen.css";

/*
 * S4 バブル詳細。
 *
 * 主役はバブル本文。周辺にリアクション行（バブルなので3種）、あやす一覧、あやすボタン。
 *
 * ★ あやす一覧には赤ちゃんのあやすとお母さんのあやすが混ざり、
 *   リアクション行の中身がそれぞれ変わる（3種 / ばぶー1種）。
 *   出しわけは SootheItem が発信ペルソナから決める。ここでは選び直さない。
 *
 * ★ 一覧に並ぶのは「バブルに直接ついたあやす」だけ（人間の指示、2026-08-26）。
 *   あやすへの返信は、その1件を押して開いた先（S4b あやす詳細）に入る。
 *   以前は返信も同じ列に平らに混ざっていて、何件ついているのかが読めなかった。
 *   絞っているのは fetchBubbleDetail の側で、ここは受け取ったものを並べるだけ。
 *
 * 自分のバブルにだけ削除を出す（FR-POST-006/007）。不可逆なので確認を出す。
 */

type BubbleDetailScreenProps = {
  readonly detail: BubbleDetail;
  readonly onBack: () => void;
  readonly onOpenProfile: (personaId: string) => void;
  readonly onReactToBubble: (bubbleId: string, reaction: ReactionType) => void;
  readonly onReactToSoothe: (
    sootheId: string,
    authorKind: Soothe["author"]["kind"],
    reaction: ReactionType,
  ) => void;
  readonly onOpenSoothe: (target: SootheTarget) => void;
  /** あやす1件を押したとき。そのあやすの詳細（誰があやしているか）へ */
  readonly onOpenSootheDetail: (sootheId: string) => void;
  readonly onDelete: (bubbleId: string) => void;
};

export function BubbleDetailScreen({
  detail,
  onBack,
  onOpenProfile,
  onReactToBubble,
  onReactToSoothe,
  onOpenSoothe,
  onOpenSootheDetail,
  onDelete,
}: BubbleDetailScreenProps) {
  const [confirming, setConfirming] = useState(false);
  const { bubble, soothes } = detail;

  return (
    <>
      <ScreenHeader title="バブル" onBack={onBack} />

      <div className={cx("eg-column", "eg-detail")}>
        <article className="eg-detail__bubble">
          <PersonaChip
            persona={bubble.author}
            createdAt={bubble.createdAt}
            showRole={false}
            onOpenProfile={onOpenProfile}
          />
          <BubbleBody body={bubble.body} className="eg-detail__body" />
          <div className="eg-detail__reactions">
            <ReactionRow
              targetKind="bubble"
              state={bubble.reactions}
              onReact={(reaction) => onReactToBubble(bubble.id, reaction)}
              readOnly={bubble.isMine}
            />
          </div>
          {/* 自分のバブルにだけ出す。他人のバブルには出さない */}
          {bubble.isMine ? (
            <div className="eg-detail__own">
              <button
                type="button"
                className={cx("eg-detail__delete", "t-label", "eg-touch")}
                onClick={() => setConfirming(true)}
              >
                <IconTrash />
                このバブルを けす
              </button>
            </div>
          ) : null}
        </article>

        <section className="eg-detail__soothes" aria-labelledby="eg-soothes-title">
          <h2 id="eg-soothes-title" className={cx("eg-detail__soothes-title", "t-heading")}>
            あやす
            {soothes.length > 0 ? (
              <span className={cx("eg-detail__soothes-count", "t-counter")}>{soothes.length}</span>
            ) : null}
          </h2>

          {soothes.length === 0 ? (
            <EmptyState
              lines={["まだ だれも あやしていません。", "さいしょの ひとりに なってみる？"]}
            />
          ) : (
            <ul className="eg-detail__soothe-list">
              {soothes.map((soothe) => (
                <SootheItem
                  key={soothe.id}
                  soothe={soothe}
                  onOpenProfile={onOpenProfile}
                  onReact={(sootheId, reaction) =>
                    onReactToSoothe(sootheId, soothe.author.kind, reaction)
                  }
                  onReply={(target) =>
                    onOpenSoothe({
                      kind: "soothe",
                      bubbleId: bubble.id,
                      sootheId: target.id,
                      authorKind: target.author.kind,
                      authorNickname: target.author.nickname,
                      bubbleIsMine: bubble.isMine,
                    })
                  }
                  onOpen={(target) => onOpenSootheDetail(target.id)}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      <BottomAction>
        <Button
          fullWidth
          onClick={() =>
            onOpenSoothe({
              kind: "bubble",
              bubbleId: bubble.id,
              authorNickname: bubble.author.nickname,
              bubbleIsMine: bubble.isMine,
            })
          }
        >
          <IconSoothe />
          あやす
        </Button>
      </BottomAction>

      {confirming ? (
        <ConfirmDialog
          title="このバブル、消しちゃう？"
          body="元には戻せないよ。あやしてくれた ことばも いっしょに 消えます。"
          confirmLabel="けす"
          cancelLabel="やめる"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            onDelete(bubble.id);
          }}
        />
      ) : null}
    </>
  );
}
