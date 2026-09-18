import type { FeedResult } from "../data/api";
import type { ReactionType } from "../data/types";
import { cx } from "../lib/cx";
import { BubbleList } from "../components/BubbleList";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { ScreenHeader } from "../components/ScreenHeader";
import { SkeletonFeed } from "../components/Skeleton";
import { IconRefresh } from "../components/icons";
import "./TimelineScreen.css";

/*
 * S2 タイムライン。
 *
 * 主役はバブル1つ（本文 16px / 行間 1.9）。カードは吹き出しの形で、
 * 書いた人はしっぽの先に付く（BubbleCard）。
 *
 * ★ 先頭に「口上」を置く（UI刷新 2026-08-26）。
 *   ここが多くの人にとって最初に見る画面なので、
 *   「これは何をする場所か」を、機能の説明ではなく1行の呼びかけで出す。
 *   スクロールすれば流れて消え、上の細い見出しだけが残る。
 *
 * 上に「おなじくらい つかれてる子」の帯を置いているのは、単純な新着順にしないため
 * （FR-FEED-002）。並べ替えの判断は data/api.ts の fetchFeed が持っている。
 *
 * 見出しの右に「あたらしくする」。読み込み中は押せなくして、アイコンを回す（NFR-006）。
 * 自動で入れ替えない。読んでいる途中で並びが変わると、どこを読んでいたか分からなくなる。
 *
 * 状態は3つ：読み込み中（skeleton）、空、並んだあと。
 * ★ カードごとの「よんだ／まだ」は持たない（人間の指示、2026-08-27 で廃止）。
 * 置いていないもの：既読、フォロワー数、通報、DM、絶対時刻、本文の自動リンク化。
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
        {/*
          口上。見出し（h1）は上の細い帯が持っているので、ここは段落として書く。
          同じ画面に h1 を2つ置かないため。
        */}
        <div className="eg-timeline__lede">
          <p className={cx("eg-timeline__kicker", "t-label")}>よふけの えんじいろ</p>
          <p className={cx("eg-timeline__headline", "t-display")}>
            よわねは、ここで
            <br />
            バブルに なります。
          </p>
          <p className={cx("eg-timeline__sub", "t-body")}>
            だれが 言ったかより、なにを かかえているか。
            <br />
            読むだけでも、そっと あやすだけでも いい。
          </p>
        </div>

        {loading || feed === null ? <SkeletonFeed count={3} /> : null}

        {isEmpty ? (
          <div className="eg-timeline__empty">
            <EmptyState
              illustration="haven"
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
                <BubbleList
                  bubbles={feed.recommended}
                  onOpen={onOpenBubble}
                  onOpenProfile={onOpenProfile}
                  onReact={onReact}
                />
              </section>
            ) : null}

            {feed.rest.length > 0 ? (
              <section className="eg-timeline__section" aria-labelledby="eg-rest-title">
                <h2 id="eg-rest-title" className={cx("eg-timeline__rest-title", "t-heading")}>
                  そのほかの バブル
                </h2>
                <BubbleList
                  bubbles={feed.rest}
                  onOpen={onOpenBubble}
                  onOpenProfile={onOpenProfile}
                  onReact={onReact}
                />
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
