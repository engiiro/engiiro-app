import "./Skeleton.css";

/*
 * 読み込み中（DESIGN.md §7.3 skeleton-reveal）。
 * 脈動は ease-linear。本体が来たら cross-blur で入れ替える（eg-revealed）。
 */

export function SkeletonBubbleCard() {
  return (
    <div className="eg-skeleton-card" aria-hidden="true">
      <div className="eg-skeleton-line eg-skeleton-line--head" />
      <div className="eg-skeleton-row">
        <div className="eg-skeleton-stack">
          <div className="eg-skeleton-line" />
          <div className="eg-skeleton-line" />
          <div className="eg-skeleton-line eg-skeleton-line--short" />
        </div>
      </div>
      <div className="eg-skeleton-row">
        <div className="eg-skeleton-pill" />
        <div className="eg-skeleton-pill" />
      </div>
    </div>
  );
}

export function SkeletonFeed({ count = 3 }: { readonly count?: number }) {
  return (
    <div className="eg-feed-list" role="status" aria-label="バブルを よみこんでいます">
      {Array.from({ length: count }, (_, index) => (
        <SkeletonBubbleCard key={index} />
      ))}
    </div>
  );
}
