import { useState } from "react";

import type { ActivityEntry, ActivityTab, PublicProfile } from "../data/types";
import { cx } from "../lib/cx";
import { ActivityItem } from "../components/ActivityItem";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { LikeButton } from "../components/LikeButton";
import { PersonaSummaryCard } from "../components/PersonaSummaryCard";
import { ScreenHeader } from "../components/ScreenHeader";
import { SegmentedTabs } from "../components/SegmentedTabs";
import type { SegmentedTab } from "../components/SegmentedTabs";
import { SkeletonFeed } from "../components/Skeleton";
import "./PublicProfileScreen.css";

/*
 * S6 他人の公開プロフィール（人間の指示、2026-08-25）。
 *
 * S8 と同じ部品で組み、出す項目だけを減らす。
 *
 * ★ S8 から落としたもの（人間の指示、および FR-PERSONA-004 / FR-PRIV-004）：
 *   - 生年月日。両ペルソナは同時に作られるので、公開すると突き合わせで同一人物が割れる
 *   - 大好きな赤ちゃん達／お母さん達の数と中身（FR-FOLLOW-003 は本人だけの要件）
 *   - もう一方のペルソナへの導線。リンクも、履歴も、示唆も置かない
 *   - 「この画面はあなたにしか見えません」の注記（ここは他人にも見える画面）
 *
 * ★ 出す一覧は、そのペルソナの種類だけで決まる：
 *   赤ちゃん … 赤ちゃんの バブル ／ 赤ちゃんの バブルとあやす の2つ
 *   お母さん … お母さんの あやす の1つだけ
 *   お母さんはバブルを投稿できない（FR-POST-003）ので、赤ちゃん側の切り替えを出さない。
 *   隠すのではなく、そのペルソナに存在しない選択肢を作らない。
 *
 * 追加したもの：大好きボタン（＝フォロー。FR-FOLLOW-001/002）。
 * 自分のペルソナを開いたときは出さない。
 */

const BABY_TABS: readonly SegmentedTab<ActivityTab>[] = [
  { value: "babyBubbles", label: "赤ちゃんの バブル" },
  { value: "babyAll", label: "赤ちゃんの バブルとあやす" },
];

const MOTHER_TABS: readonly SegmentedTab<ActivityTab>[] = [
  { value: "motherSoothes", label: "お母さんの あやす" },
];

/** 一度に見せる件数。押すたびにこの数ずつ増える */
const PAGE_SIZE = 5;

type PublicProfileScreenProps = {
  readonly profile: PublicProfile | null;
  readonly activity: readonly ActivityEntry[];
  readonly loading: boolean;
  readonly activityLoading: boolean;
  readonly tab: ActivityTab;
  readonly likePending: boolean;
  readonly onTabChange: (tab: ActivityTab) => void;
  readonly onToggleLike: (next: boolean) => void;
  readonly onOpenBubble: (bubbleId: string) => void;
  readonly onBack: () => void;
};

export function PublicProfileScreen({
  profile,
  activity,
  loading,
  activityLoading,
  tab,
  likePending,
  onTabChange,
  onToggleLike,
  onOpenBubble,
  onBack,
}: PublicProfileScreenProps) {
  const [visible, setVisible] = useState(PAGE_SIZE);

  if (loading || profile === null) {
    return (
      <>
        <ScreenHeader title="プロフィール" onBack={onBack} />
        <div className={cx("eg-column", "eg-pubprofile")}>
          <SkeletonFeed count={2} />
        </div>
      </>
    );
  }

  const isBaby = profile.persona.kind === "baby";
  const tabs = isBaby ? BABY_TABS : MOTHER_TABS;
  const shown = activity.slice(0, visible);
  const hasMore = activity.length > shown.length;
  const isEmpty = !activityLoading && activity.length === 0;

  return (
    <>
      <ScreenHeader title="プロフィール" onBack={onBack} />

      <div className={cx("eg-column", "eg-pubprofile")}>
        <PersonaSummaryCard
          persona={profile.persona}
          caption={captionOf(profile)}
          note={axisNote(profile)}
          action={
            /* 自分のペルソナには出さない。付けられない操作を disabled で見せない */
            profile.isMe ? null : (
              <LikeButton
                liked={profile.liked}
                kind={profile.persona.kind}
                nickname={profile.persona.nickname}
                pending={likePending}
                onToggle={onToggleLike}
              />
            )
          }
        />

        <div className="eg-pubprofile__tabs">
          <SegmentedTabs
            tabs={tabs}
            current={tab}
            onChange={(next) => {
              onTabChange(next);
              setVisible(PAGE_SIZE);
            }}
            panelId="eg-pubprofile-list"
            label="表示する記録の切り替え"
          />
        </div>

        <div
          id="eg-pubprofile-list"
          role="tabpanel"
          aria-labelledby={"eg-pubprofile-list-tab-" + tab}
          className="eg-pubprofile__panel"
        >
          {activityLoading ? <SkeletonFeed count={2} /> : null}

          {isEmpty ? (
            <EmptyState
              lines={
                isBaby
                  ? ["この子の ことばは、まだ ありません。"]
                  : ["この人が あやした ことばは、まだ ありません。"]
              }
            />
          ) : null}

          {!activityLoading && !isEmpty ? (
            <>
              <ul className="eg-pubprofile__list">
                {shown.map((item) => (
                  <ActivityItem
                    key={item.kind === "bubble" ? item.bubble.id : item.soothe.id}
                    item={item}
                    onOpen={onOpenBubble}
                  />
                ))}
              </ul>
              {hasMore ? (
                <div className="eg-pubprofile__more">
                  <Button variant="quiet" onClick={() => setVisible(visible + PAGE_SIZE)}>
                    さらに よみこむ
                  </Button>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}

/**
 * 推定の一行。
 *   赤ちゃん … 「推定 1歳2か月」（FR-PROFILE-001。文章そのものの幼さ）
 *   お母さん … 「推定 1歳児を あやし中」（FR-PROFILE-002。向けている相手の年齢）
 * 評価が使えないときは、その旨に置き換える（NFR-002）。
 */
function captionOf(profile: PublicProfile): string {
  if (profile.status === null) {
    return "いま はかれません";
  }
  if (profile.status.sampleCount === 0) {
    return "まだ ことばが ありません";
  }
  if (profile.persona.kind === "baby") {
    return "推定 " + profile.status.label;
  }
  return "推定 " + String(Math.floor(profile.status.months / 12)) + "歳児を あやし中";
}

/**
 * 推定の下に小さく添える、何を測ったのかの一行。S8 と同じ扱い。
 * 赤ちゃん度とお母さん度は別の軸なので、軸の名前を必ず添える（FR-AI-EVAL-002）。
 */
function axisNote(profile: PublicProfile): string | undefined {
  if (profile.status === null) {
    return "いま、ことばの はかりは 使えません。";
  }
  return profile.status.axis;
}
