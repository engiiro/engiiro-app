import type { ActivityEntry, ActivityTab, PublicProfile } from "../data/types";
import { cx } from "../lib/cx";
import { personaStatusCaption } from "../lib/personaStatusText";
import { ActivityPanel } from "../components/ActivityPanel";
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
  /** 一覧のあやすを押したとき。そのあやすの詳細へ（人間の指示、2026-08-26） */
  readonly onOpenSoothe: (sootheId: string) => void;
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
  onOpenSoothe,
  onBack,
}: PublicProfileScreenProps) {
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

  return (
    <>
      <ScreenHeader title="プロフィール" onBack={onBack} />

      <div className={cx("eg-column", "eg-pubprofile")}>
        <PersonaSummaryCard
          persona={profile.persona}
          caption={personaStatusCaption(
            profile.status,
            profile.persona.kind,
            "まだ ことばが ありません",
          )}
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
            onChange={onTabChange}
            panelId="eg-pubprofile-list"
            label="表示する記録の切り替え"
          />
        </div>

        <ActivityPanel
          panelId="eg-pubprofile-list"
          tab={tab}
          items={activity}
          loading={activityLoading}
          emptyLines={
            isBaby
              ? ["この子の ことばは、まだ ありません。"]
              : ["この人が あやした ことばは、まだ ありません。"]
          }
          /* 他人の画面では誘わない。この人の代わりに書くことはできない */
          onOpenBubble={onOpenBubble}
          onOpenSoothe={onOpenSoothe}
        />
      </div>
    </>
  );
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
