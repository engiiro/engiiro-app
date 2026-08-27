import type { FeedResult } from "../data/api";
import type { ReactionType } from "../data/types";
import { cx } from "../lib/cx";
import { BubbleCard } from "../components/BubbleCard";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { ScreenHeader } from "../components/ScreenHeader";
import { SkeletonFeed } from "../components/Skeleton";
import { IconRefresh } from "../components/icons";
import "./TimelineScreen.css";

/*
 * S2 タイムライン。
 *
 * 主役はバブルカード1枚（本文 16px / 行間 1.9）。1画面に 2.5 枚見える密度。
 * 視線は ニックネーム → 本文 → リアクション の順。
 *
 * 上に「おなじくらい つかれてる子」の帯を置いているのは、単純な新着順にしないため
 * （FR-FEED-002）。並べ替えの判断は data/api.ts の fetchFeed が持っている。
 *
 * 見出しの右に「あたらしくする」。読み込み中は押せなくして、アイコンを回す（NFR-006）。
 * 自動で入れ替えない。読んでいる途中で並びが変わると、どこを読んでいたか分からなくなる。
 *
 * 状態は4つ：未読／押下済（カードごと）、読み込み中（skeleton）、空。
 * 置いていないもの：フォロワー数、通報、DM、絶対時刻、本文の自動リンク化。
 */

type TimelineScreenProps = {
  readonly feed: FeedResult | null;
  readonly loading: boolean;
  readonly onOpenBubble: (bubbleId: string) => void;
  readonly onOpenProfile: (personaId: string) => void;
  /** 読み込み直し（人間の指示、2026-08-25） */
  readonly onRefresh: () => void;
  readonly onReact: (bubbleId: string, reaction: ReactionType) => void;
  readonly onCompose: () => void;
};

export function TimelineScreen({
  feed,
  loading,
  onOpenBubble,
  onOpenProfile,
  onRefresh,
  onReact,
  onCompose,
}: TimelineScreenProps) {
  const isEmpty = !loading && feed !== null && feed.recommended.length + feed.rest.length === 0;

  return (
    <>
      <ScreenHeader
        title="ホーム"
        aside={
          <button
            type="button"
            className={cx("eg-timeline__refresh", "eg-touch", "t-label")}
            onClick={onRefresh}
            disabled={loading}
          >
            <IconRefresh className={cx("eg-timeline__refresh-icon", loading && "is-spinning")} />
            あたらしくする
          </button>
        }
      />

      <div className={cx("eg-column", "eg-timeline")}>
        {loading || feed === null ? <SkeletonFeed count={3} /> : null}

        {isEmpty ? (
          <div className="eg-timeline__empty">
            <EmptyState
              lines={[
                "ここから先はまだ、だれも吐き出していません。",
                "いちばん最初に なってみる？",
              ]}
              action={<Button onClick={onCompose}>バブルを かく</Button>}
            />
          </div>
        ) : null}

        {!loading && feed !== null && !isEmpty ? (
          <div className="eg-revealed">
            {feed.recommended.length > 0 ? (
              <section className="eg-timeline__section" aria-labelledby="eg-band-title">
                <div className="eg-timeline__band">
                  <h2 id="eg-band-title" className={cx("eg-timeline__band-title", "t-heading")}>
                    おなじくらい つかれてる子
                  </h2>
                  <p className={cx("eg-timeline__band-note", "t-caption")}>
                    あたらしい順ではなく、いまの あなたに 近いバブルから 出しています。
                  </p>
                </div>
                <div className="eg-feed-list">
                  {feed.recommended.map((bubble) => (
                    <BubbleCard
                      key={bubble.id}
                      bubble={bubble}
                      onOpen={onOpenBubble}
                      onOpenProfile={onOpenProfile}
                      onReact={onReact}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {feed.rest.length > 0 ? (
              <section className="eg-timeline__section" aria-labelledby="eg-rest-title">
                <h2 id="eg-rest-title" className={cx("eg-timeline__rest-title", "t-heading")}>
                  そのほかの バブル
                </h2>
                <div className="eg-feed-list">
                  {feed.rest.map((bubble) => (
                    <BubbleCard
                      key={bubble.id}
                      bubble={bubble}
                      onOpen={onOpenBubble}
                      onOpenProfile={onOpenProfile}
                      onReact={onReact}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
