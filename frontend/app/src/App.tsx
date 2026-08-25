import { useCallback, useEffect, useState } from "react";

import {
  addReaction,
  deleteBubble,
  fetchBubbleDetail,
  fetchEmptyFeed,
  fetchFeed,
  fetchMyActivity,
  fetchMyProfile,
  markRead,
  setAiEvaluateAvailability,
} from "./data/api";
import type { FeedResult } from "./data/api";
import { ME } from "./data/personas";
import { reactionTargetOfSoothe } from "./data/reactions";
import type {
  BubbleDetail,
  MyActivityItem,
  MyActivityTab,
  MyProfile,
  PersonaKind,
  ReactionType,
} from "./data/types";
import { LeftRail } from "./components/LeftRail";
import type { CenterView } from "./components/LeftRail";
import { MockControls } from "./components/MockControls";
import type { FeedMode } from "./components/MockControls";
import { RightRail } from "./components/RightRail";
import { SkeletonFeed } from "./components/Skeleton";
import { Toast } from "./components/Toast";
import { IconPen } from "./components/icons";
import type { SootheTarget } from "./lib/soothePersonaRule";
import { cx } from "./lib/cx";
import { useTheme } from "./lib/useTheme";
import { BubbleDetailScreen } from "./screens/BubbleDetailScreen";
import { ComposePanel } from "./screens/ComposePanel";
import type { ComposeMode } from "./screens/ComposePanel";
import { MyProfileScreen } from "./screens/MyProfileScreen";
import { PlaceholderScreen } from "./screens/PlaceholderScreen";
import { TimelineScreen } from "./screens/TimelineScreen";
import "./App.css";

/*
 * 画面の骨組み（人間の決定、2026-08-25）。
 *
 *   左サイド … ホーム／さがす／おしらせ／おきにいり／プロフィール／せってい
 *   中央     … タイムライン。左サイドを押すと中身が差し替わる
 *   右サイド … 後々の読み物。バブるボタンを押すと投稿パネルに入れ替わる
 *
 * PC を主にした構成。DESIGN.md §5.2「カラムを増やさない」・§8.1「モバイルファースト」
 * とは食い違っており、改訂案を別途出す前提で先に実装している。
 *
 * データの読み書きは必ず data/api.ts を通す。ここで直接ダミーデータを書き換えない。
 */

export function App() {
  const { theme, setTheme } = useTheme();
  /*
   * AI は「評価」と「生成」を別に扱う（PO 回答 2026-08-25、Issue #19）。
   *   評価が使えない … バブルもあやすもできない（NFR-003）
   *   生成が使えない … 投稿とあやすは続けられる（NFR-001）
   */
  const [aiEvaluateAvailable, setAiEvaluateAvailable] = useState(true);
  const [aiTransformAvailable, setAiTransformAvailable] = useState(true);
  const [feedMode, setFeedMode] = useState<FeedMode>("normal");

  const [view, setView] = useState<CenterView>("timeline");
  const [detailBubbleId, setDetailBubbleId] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedResult | null>(null);
  const [feedLoading, setFeedLoading] = useState(true);
  const [detail, setDetail] = useState<BubbleDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [compose, setCompose] = useState<ComposeMode | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  /*
   * S8 本人専用プロフィール。
   *
   * 両ペルソナが入った MyProfile を持てるのは、この画面を出しているときだけ。
   * フィードや詳細の描画にこの状態を混ぜない（FR-PERSONA-005）。
   */
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [activityTab, setActivityTab] = useState<MyActivityTab>("babyBubbles");
  const [activity, setActivity] = useState<readonly MyActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);

  const loadFeed = useCallback(async () => {
    const result = feedMode === "empty" ? await fetchEmptyFeed() : await fetchFeed();
    setFeed(result);
    setFeedLoading(false);
  }, [feedMode]);

  useEffect(() => {
    if (feedMode === "loading") {
      return;
    }
    // oxlint-disable-next-line react/set-state-in-effect
    void loadFeed();
  }, [feedMode, loadFeed]);

  const showFeedSkeleton = feedLoading || feedMode === "loading";

  const loadDetail = useCallback(async (bubbleId: string) => {
    setDetailLoading(true);
    const result = await fetchBubbleDetail(bubbleId);
    setDetail(result);
    setDetailLoading(false);
  }, []);

  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    setProfile(await fetchMyProfile());
    setProfileLoading(false);
  }, []);

  const loadActivity = useCallback(async (tab: MyActivityTab) => {
    setActivityLoading(true);
    setActivity(await fetchMyActivity(tab));
    setActivityLoading(false);
  }, []);

  const openBubble = useCallback(
    (bubbleId: string) => {
      markRead(bubbleId);
      setDetailBubbleId(bubbleId);
      void loadDetail(bubbleId);
    },
    [loadDetail],
  );

  const backToTimeline = useCallback(() => {
    setDetailBubbleId(null);
    setDetail(null);
    if (feedMode !== "loading") {
      setFeedLoading(true);
      void loadFeed();
    }
  }, [feedMode, loadFeed]);

  const navigate = useCallback(
    (next: CenterView) => {
      setView(next);
      setDetailBubbleId(null);
      setDetail(null);
      if (next === "timeline" && feedMode !== "loading") {
        setFeedLoading(true);
        void loadFeed();
      }
      if (next === "profile") {
        // 評価が落ちている／戻った直後でもその時点の状態を出したいので、開くたびに引き直す
        void loadProfile();
        void loadActivity(activityTab);
      }
    },
    [activityTab, feedMode, loadActivity, loadFeed, loadProfile],
  );

  const refresh = useCallback(async () => {
    if (view === "profile") {
      await Promise.all([loadProfile(), loadActivity(activityTab)]);
      return;
    }
    if (detailBubbleId) {
      await loadDetail(detailBubbleId);
    } else if (feedMode !== "loading") {
      await loadFeed();
    }
  }, [activityTab, detailBubbleId, feedMode, loadActivity, loadDetail, loadFeed, loadProfile, view]);

  const reactToBubble = useCallback(
    async (bubbleId: string, reaction: ReactionType) => {
      await addReaction({
        target: { type: "bubble", id: bubbleId },
        targetKind: "bubble",
        reaction,
      });
      await refresh();
    },
    [refresh],
  );

  const reactToSoothe = useCallback(
    async (sootheId: string, authorKind: PersonaKind, reaction: ReactionType) => {
      await addReaction({
        target: { type: "soothe", id: sootheId },
        // 対象の種類は発信ペルソナから決まる。ここで種類を選び直さない
        targetKind: reactionTargetOfSoothe(authorKind),
        reaction,
      });
      await refresh();
    },
    [refresh],
  );

  const removeBubble = useCallback(
    async (bubbleId: string) => {
      await deleteBubble(bubbleId);
      setToast("バブルを けしました");
      if (view === "profile") {
        // S8 からの削除では画面を移さない。消えたことがその場で分かるように引き直すだけ
        await Promise.all([loadProfile(), loadActivity(activityTab)]);
        return;
      }
      backToTimeline();
    },
    [activityTab, backToTimeline, loadActivity, loadProfile, view],
  );

  /** S8 の一覧からバブルを開く。詳細はタイムライン側の画面なので、そちらへ移る */
  const openBubbleFromProfile = useCallback(
    (bubbleId: string) => {
      setView("timeline");
      openBubble(bubbleId);
    },
    [openBubble],
  );

  const openReply = useCallback((target: SootheTarget) => {
    setCompose({ kind: "reply", target });
  }, []);

  // 画面を入れ替えたら中央を先頭へ戻す
  useEffect(() => {
    document.querySelector(".eg-center")?.scrollTo({ top: 0 });
  }, [view, detailBubbleId]);

  const showTimeline = view === "timeline";

  return (
    <div className={cx("eg-app", compose && "is-composing")}>
      <MockControls
        theme={theme}
        onThemeChange={setTheme}
        aiEvaluateAvailable={aiEvaluateAvailable}
        onAiEvaluateChange={(available) => {
          setAiEvaluateAvailable(available);
          // サーバ側の評価も落ちている扱いにする（投稿の可否が評価に依存するため）
          setAiEvaluateAvailability(available);
        }}
        aiTransformAvailable={aiTransformAvailable}
        onAiTransformChange={setAiTransformAvailable}
        feedMode={feedMode}
        onFeedModeChange={(mode) => {
          setFeedLoading(true);
          setFeedMode(mode);
        }}
      />

      <div className="eg-layout">
        <div className="eg-layout__left">
          <LeftRail current={view} onNavigate={navigate} />
        </div>

        <main className="eg-center">
          {!showTimeline && view !== "profile" ? <PlaceholderScreen view={view} /> : null}

          {view === "profile" ? (
            <MyProfileScreen
              profile={profile}
              activity={activity}
              loading={profileLoading}
              activityLoading={activityLoading}
              tab={activityTab}
              onTabChange={(next) => {
                setActivityTab(next);
                void loadActivity(next);
              }}
              onOpenBubble={openBubbleFromProfile}
              onDeleteBubble={(bubbleId) => void removeBubble(bubbleId)}
              onOpenFollowing={() => {
                // S7 フォロー中一覧はこれから。押した先が無いことを黙って隠さない
                setToast("フォロー中の 一覧は これから つくります");
              }}
              onCompose={() => setCompose({ kind: "bubble" })}
            />
          ) : null}

          {showTimeline && detailBubbleId === null ? (
            <TimelineScreen
              feed={feed}
              loading={showFeedSkeleton}
              onOpenBubble={openBubble}
              onReact={(bubbleId, reaction) => void reactToBubble(bubbleId, reaction)}
              onCompose={() => setCompose({ kind: "bubble" })}
            />
          ) : null}

          {showTimeline && detailBubbleId !== null ? (
            detailLoading || detail === null ? (
              <div className="eg-center__loading">
                <SkeletonFeed count={1} />
              </div>
            ) : (
              <BubbleDetailScreen
                detail={detail}
                onBack={backToTimeline}
                onReactToBubble={(bubbleId, reaction) => void reactToBubble(bubbleId, reaction)}
                onReactToSoothe={(sootheId, authorKind, reaction) =>
                  void reactToSoothe(sootheId, authorKind, reaction)
                }
                onOpenSoothe={openReply}
                onDelete={(bubbleId) => void removeBubble(bubbleId)}
              />
            )
          ) : null}

          {/* 中央の右下。押すと右の列が投稿パネルに入れ替わる */}
          {compose === null ? (
            <button
              type="button"
              className={cx("eg-bubble-fab", "t-button")}
              onClick={() => setCompose({ kind: "bubble" })}
            >
              <IconPen />
              バブる
            </button>
          ) : null}
        </main>

        <div className="eg-layout__right">
          {compose ? (
            <ComposePanel
              mode={compose}
              me={ME}
              aiEvaluateAvailable={aiEvaluateAvailable}
              aiTransformAvailable={aiTransformAvailable}
              onClose={() => setCompose(null)}
              onPosted={(message) => {
                setCompose(null);
                setToast(message);
                void refresh();
              }}
            />
          ) : (
            <RightRail />
          )}
        </div>
      </div>

      {toast ? <Toast message={toast} onDone={() => setToast(null)} /> : null}
    </div>
  );
}
