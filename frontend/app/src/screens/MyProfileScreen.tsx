import { useState } from "react";

import type {
  ActivityEntry,
  ActivityTab,
  MyProfile,
  MyProfileEntry,
  PersonaKind,
} from "../data/types";
import { birthdayText } from "../lib/birthday";
import { cx } from "../lib/cx";
import { ActivityItem } from "../components/ActivityItem";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmptyState } from "../components/EmptyState";
import { NoteBox } from "../components/NoteBox";
import { PersonaSummaryCard } from "../components/PersonaSummaryCard";
import { RowLink } from "../components/RowLink";
import { ScreenHeader } from "../components/ScreenHeader";
import { SegmentedTabs } from "../components/SegmentedTabs";
import type { SegmentedTab } from "../components/SegmentedTabs";
import { SkeletonFeed } from "../components/Skeleton";
import { IconCalendar, IconHeart } from "../components/icons";
import "./MyProfileScreen.css";

/*
 * S8 本人専用プロフィール（人間の指示、2026-08-25 のモック）。
 *
 * 画面の並び：
 *   赤ちゃんカード ／ お母さんカード（横に2枚）
 *   生年月日
 *   フォロー欄（大好きな赤ちゃん達 ／ 大好きなお母さん達）
 *   切り替え3つ ＋ 一覧
 *
 * ★ この画面は、自分の両ペルソナを同時に出してよい唯一の場所
 *   （FR-PERSONA-005、DESIGN.md §0.1-1）。同じ形のカードを2枚並べる画面を、ここ以外に作らない。
 *
 * ★ 出していないもの：
 *   - フォロワー数・フォロワー一覧。本人にも見せない（FR-FOLLOW-004/005、OUT-004）
 *   - 自分の公開プロフィール（S6）への導線。本人には害が無いが、S6 へ渡す id を
 *     本人画面から作り始めると、いつか公開系へ同じ形が漏れる。必要なら仕様を決めてから足す
 *   - 通報・DM（OUT-001/002）
 *
 * ★ 赤ちゃん度とお母さん度は別の軸で、同じ尺度の値ではない（FR-AI-EVAL-002）。
 *   横に並べても「どちらが大きい」と読ませないよう、軸の名前を必ず添える。
 *
 * AI 文章評価が使えないときは、ステータスだけを「はかれません」にする（NFR-002）。
 * プロフィールそのものは読めるままにする。
 */

const TABS: readonly SegmentedTab<ActivityTab>[] = [
  // モックの「ポスト」「あやし」は、docs/specification.md §3.1 の用語では「バブル」「あやす」
  { value: "babyBubbles", label: "赤ちゃんの バブル" },
  { value: "babyAll", label: "赤ちゃんの バブルとあやす" },
  { value: "motherSoothes", label: "お母さんの あやす" },
];

const EMPTY_LINES: Readonly<Record<ActivityTab, readonly string[]>> = {
  babyBubbles: ["まだ バブルを かいていません。", "はじめの ひとことを だしてみる？"],
  babyAll: ["赤ちゃんとしての 記録は まだ ありません。"],
  motherSoothes: ["お母さんとして あやした ことばは まだ ありません。"],
};

/** 一度に見せる件数。押すたびにこの数ずつ増える */
const PAGE_SIZE = 5;

type MyProfileScreenProps = {
  readonly profile: MyProfile | null;
  readonly activity: readonly ActivityEntry[];
  readonly loading: boolean;
  readonly activityLoading: boolean;
  readonly tab: ActivityTab;
  readonly onTabChange: (tab: ActivityTab) => void;
  readonly onOpenBubble: (bubbleId: string) => void;
  readonly onDeleteBubble: (bubbleId: string) => void;
  readonly onOpenFollowing: (kind: PersonaKind) => void;
  readonly onCompose: () => void;
};

export function MyProfileScreen({
  profile,
  activity,
  loading,
  activityLoading,
  tab,
  onTabChange,
  onOpenBubble,
  onDeleteBubble,
  onOpenFollowing,
  onCompose,
}: MyProfileScreenProps) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [deleting, setDeleting] = useState<string | null>(null);

  const shown = activity.slice(0, visible);
  const hasMore = activity.length > shown.length;
  const isEmpty = !activityLoading && activity.length === 0;

  return (
    <>
      <ScreenHeader title="マイプロフィール" />

      <div className={cx("eg-column", "eg-myprofile")}>
        <NoteBox>この画面は あなたにしか 見えません。</NoteBox>

        {loading || profile === null ? (
          <div className="eg-myprofile__loading">
            <SkeletonFeed count={2} />
          </div>
        ) : (
          <>
            {/* FR-PERSONA-005：両ペルソナを並べてよいのは、この画面だけ */}
            <div className="eg-myprofile__personas">
              <PersonaSummaryCard
                persona={profile.baby.persona}
                caption={babyCaption(profile.baby)}
                note={axisNote(profile.baby)}
              />
              <PersonaSummaryCard
                persona={profile.mother.persona}
                caption={motherCaption(profile.mother)}
                note={axisNote(profile.mother)}
              />
            </div>

            {/* 生年月日は S8 でしか出さない（DESIGN.md §0.1-5・FR-PRIV-004） */}
            <div className="eg-myprofile__birthday">
              <IconCalendar className="eg-myprofile__birthday-icon" />
              <span className={cx("eg-myprofile__birthday-label", "t-body")}>生年月日</span>
              <span className={cx("eg-myprofile__birthday-value", "t-metric")}>
                {birthdayText(profile.birthday)}
              </span>
            </div>

            {/*
              フォロー「中」の一覧への入り口（FR-FOLLOW-003）。
              フォロー「されている」側の行は作らない（FR-FOLLOW-004/005、OUT-004）
            */}
            <div className="eg-myprofile__follows">
              <RowLink
                label="大好きな 赤ちゃん達"
                count={profile.followingBabyCount}
                icon={IconHeart}
                tone="baby"
                onClick={() => onOpenFollowing("baby")}
              />
              <RowLink
                label="大好きな お母さん達"
                count={profile.followingMotherCount}
                icon={IconHeart}
                tone="mother"
                onClick={() => onOpenFollowing("mother")}
              />
            </div>
          </>
        )}

        <div className="eg-myprofile__tabs">
          <SegmentedTabs
            tabs={TABS}
            current={tab}
            onChange={(next) => {
              onTabChange(next);
              setVisible(PAGE_SIZE);
            }}
            panelId="eg-myprofile-list"
            label="表示する記録の切り替え"
          />
        </div>

        <div
          id="eg-myprofile-list"
          role="tabpanel"
          aria-labelledby={"eg-myprofile-list-tab-" + tab}
          className="eg-myprofile__panel"
        >
          {activityLoading ? <SkeletonFeed count={2} /> : null}

          {isEmpty ? (
            <EmptyState
              lines={EMPTY_LINES[tab]}
              action={
                tab === "motherSoothes" ? undefined : (
                  <Button onClick={onCompose}>バブルを かく</Button>
                )
              }
            />
          ) : null}

          {!activityLoading && !isEmpty ? (
            <>
              <ul className="eg-myprofile__list">
                {shown.map((item) => (
                  <ActivityItem
                    key={item.kind === "bubble" ? item.bubble.id : item.soothe.id}
                    item={item}
                    onOpen={onOpenBubble}
                    onDelete={item.kind === "bubble" ? setDeleting : undefined}
                  />
                ))}
              </ul>
              {hasMore ? (
                <div className="eg-myprofile__more">
                  <Button variant="quiet" onClick={() => setVisible(visible + PAGE_SIZE)}>
                    さらに よみこむ
                  </Button>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {/* 削除は不可逆なので確認を出す（DESIGN.md §4 バブルの削除、FR-POST-006） */}
      {deleting === null ? null : (
        <ConfirmDialog
          title="このバブル、消しちゃう？"
          body="元には戻せないよ。あやしてくれた ことばも いっしょに 消えます。"
          confirmLabel="けす"
          cancelLabel="やめる"
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            const target = deleting;
            setDeleting(null);
            onDeleteBubble(target);
          }}
        />
      )}
    </>
  );
}

/** 赤ちゃん側：「推定 1歳2か月」（FR-PROFILE-001。文章そのものの幼さ） */
function babyCaption(entry: MyProfileEntry): string {
  if (entry.status === null) {
    return "いま はかれません";
  }
  if (entry.status.sampleCount === 0) {
    return "バブルを かくと はかれます";
  }
  return "推定 " + entry.status.label;
}

/** お母さん側：「推定 1歳児を あやし中」（FR-PROFILE-002。向けている相手の年齢） */
function motherCaption(entry: MyProfileEntry): string {
  if (entry.status === null) {
    return "いま はかれません";
  }
  if (entry.status.sampleCount === 0) {
    return "あやすと はかれます";
  }
  const years = Math.floor(entry.status.months / 12);
  return "推定 " + String(years) + "歳児を あやし中";
}

/**
 * 推定の下に小さく添える、何を測ったのかの一行。
 *
 * 赤ちゃん度とお母さん度は別の軸で、同じ尺度の値ではない（FR-AI-EVAL-002）。
 * 横に2枚並ぶので、軸の名前が無いと「どちらが大きい」と読めてしまう。
 * 評価が使えないときは、その旨に置き換える（NFR-002）。
 */
function axisNote(entry: MyProfileEntry): string {
  if (entry.status === null) {
    return "いま、ことばの はかりは 使えません。しばらくしてから ひらいてみてください。";
  }
  return entry.status.axis;
}
