import { useCallback, useEffect, useState } from "react";

import {
  addReaction,
  deleteBubble,
  fetchBubbleDetail,
  fetchEmptyFeed,
  fetchFeed,
  fetchLikedPersonas,
  fetchMyActivity,
  fetchMyProfile,
  fetchPublicActivity,
  fetchPublicProfile,
  markRead,
  setAiEvaluateAvailability,
  setLiked,
} from "./data/api";
import type { FeedResult } from "./data/api";
import { ME } from "./data/personas";
import { reactionTargetOfSoothe } from "./data/reactions";
import type {
  BubbleDetail,
  ActivityEntry,
  ActivityTab,
  MyProfile,
  PersonaKind,
  PublicPersona,
  PublicProfile,
  ReactionType,
} from "./data/types";
import { LeftRail } from "./components/LeftRail";
import type { CenterView } from "./components/LeftRail";
import { MockControls } from "./components/MockControls";
import type { EntryStage, FeedMode } from "./components/MockControls";
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
import { FavoritesScreen } from "./screens/FavoritesScreen";
import { IntroScreen } from "./screens/IntroScreen";
import { MyProfileScreen } from "./screens/MyProfileScreen";
import { PlaceholderScreen } from "./screens/PlaceholderScreen";
import { PublicProfileScreen } from "./screens/PublicProfileScreen";
import { SignUpScreen } from "./screens/SignUpScreen";
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

  /*
   * 画面の入り口（人間の指示、2026-08-25）。
   *   intro  … 登録の前に読む説明。サーバへ何も送らない
   *   signup … S1 アカウント登録
   *   app    … 本編
   *
   * モックなので既定は本編。説明と登録は操作帯の「入り口」から見る。
   * 本物では、未登録なら intro から始まり、登録が済めば app にしか入らない
   * （認証は Issue #7 で未確定）。
   */
  const [entry, setEntry] = useState<EntryStage>("app");

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
  const [activityTab, setActivityTab] = useState<ActivityTab>("babyBubbles");
  const [activity, setActivity] = useState<readonly ActivityEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);

  /*
   * S6 他人の公開プロフィール。
   *
   * 持つのはペルソナ id ひとつだけ。ここに accountId を置かない。
   * 開いているペルソナから もう一方へ移る道を、状態の形としても作らない（FR-PERSONA-004）。
   */
  const [publicPersonaId, setPublicPersonaId] = useState<string | null>(null);
  const [publicProfile, setPublicProfile] = useState<PublicProfile | null>(null);
  const [publicLoading, setPublicLoading] = useState(true);
  const [publicTab, setPublicTab] = useState<ActivityTab>("babyBubbles");
  const [publicActivity, setPublicActivity] = useState<readonly ActivityEntry[]>([]);
  const [publicActivityLoading, setPublicActivityLoading] = useState(true);
  const [likePending, setLikePending] = useState(false);
  /** S6 を閉じたときに戻る先 */
  const [publicBackTo, setPublicBackTo] = useState<CenterView>("timeline");

  /*
   * S7 おきにいり ＝ 大好きな人の一覧（FR-FOLLOW-003）。
   * 「大好きにした人」だけを持つ。された側の状態は置かない（FR-FOLLOW-004/005）。
   */
  const [likedBaby, setLikedBaby] = useState<readonly PublicPersona[]>([]);
  const [likedMother, setLikedMother] = useState<readonly PublicPersona[]>([]);
  const [likedLoading, setLikedLoading] = useState(true);
  const [unlikingId, setUnlikingId] = useState<string | null>(null);

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

  const loadLiked = useCallback(async () => {
    setLikedLoading(true);
    const result = await fetchLikedPersonas();
    setLikedBaby(result.baby);
    setLikedMother(result.mother);
    setLikedLoading(false);
  }, []);

  const unlike = useCallback(
    async (personaId: string) => {
      setUnlikingId(personaId);
      await setLiked(personaId, false);
      setUnlikingId(null);
      await loadLiked();
    },
    [loadLiked],
  );

  const loadActivity = useCallback(async (tab: ActivityTab) => {
    setActivityLoading(true);
    setActivity(await fetchMyActivity(tab));
    setActivityLoading(false);
  }, []);

  /**
   * S6 を開く。
   *
   * ★ 渡すのはペルソナ id ひとつ。どのペルソナから来たかも、
   *   その人のもう一方のペルソナも、この関数は受け取らない（FR-PERSONA-004）。
   *   一覧の初期タブは、開いたペルソナの種類だけで決まる。
   */
  const openProfile = useCallback(
    async (personaId: string) => {
      setPublicBackTo(view);
      setPublicPersonaId(personaId);
      setPublicLoading(true);
      setPublicActivityLoading(true);

      const found = await fetchPublicProfile(personaId);
      setPublicProfile(found);
      setPublicLoading(false);
      if (!found) {
        setPublicActivity([]);
        setPublicActivityLoading(false);
        return;
      }
      const first: ActivityTab = found.persona.kind === "mother" ? "motherSoothes" : "babyBubbles";
      setPublicTab(first);
      setPublicActivity(await fetchPublicActivity(personaId, first));
      setPublicActivityLoading(false);
    },
    [view],
  );

  const loadPublicActivity = useCallback(
    async (personaId: string, tab: ActivityTab) => {
      setPublicActivityLoading(true);
      setPublicActivity(await fetchPublicActivity(personaId, tab));
      setPublicActivityLoading(false);
    },
    [],
  );

  const closeProfile = useCallback(() => {
    setPublicPersonaId(null);
    setPublicProfile(null);
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
      setPublicPersonaId(null);
      setPublicProfile(null);
      if (next === "timeline" && feedMode !== "loading") {
        setFeedLoading(true);
        void loadFeed();
      }
      if (next === "profile") {
        // 評価が落ちている／戻った直後でもその時点の状態を出したいので、開くたびに引き直す
        void loadProfile();
        void loadActivity(activityTab);
      }
      if (next === "favorites") {
        void loadLiked();
      }
    },
    [activityTab, feedMode, loadActivity, loadFeed, loadLiked, loadProfile],
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

  /**
   * 「大好き」の付け外し（＝フォロー。FR-FOLLOW-001/002）。
   * 取り消せる操作なので確認は出さない。結果はサーバの返した値で上書きする。
   */
  const toggleLike = useCallback(
    async (next: boolean) => {
      if (!publicPersonaId) {
        return;
      }
      setLikePending(true);
      const result = await setLiked(publicPersonaId, next);
      setLikePending(false);
      if (!result.ok) {
        return;
      }
      setPublicProfile((current) => (current ? { ...current, liked: result.liked } : current));
      // おきにいりの一覧を開いたときに古いままにならないよう、ここで合わせておく
      await loadLiked();
    },
    [loadLiked, publicPersonaId],
  );

  /** プロフィールの一覧からバブルを開く。詳細はタイムライン側の画面なので、そちらへ移る */
  const openBubbleFromProfile = useCallback(
    (bubbleId: string) => {
      closeProfile();
      setView("timeline");
      openBubble(bubbleId);
    },
    [closeProfile, openBubble],
  );

  const openReply = useCallback((target: SootheTarget) => {
    setCompose({ kind: "reply", target });
  }, []);

  // 画面を入れ替えたら中央を先頭へ戻す
  useEffect(() => {
    document.querySelector(".eg-center")?.scrollTo({ top: 0 });
  }, [view, detailBubbleId, publicPersonaId]);

  /** S6 を開いているあいだは、左サイドの選択に関わらず中央を S6 にする */
  const showPublicProfile = publicPersonaId !== null;
  const showTimeline = view === "timeline" && !showPublicProfile;

  if (entry !== "app") {
    return (
      <div className="eg-app">
        <MockControls
          theme={theme}
          onThemeChange={setTheme}
          aiEvaluateAvailable={aiEvaluateAvailable}
          onAiEvaluateChange={(available) => {
            setAiEvaluateAvailable(available);
            setAiEvaluateAvailability(available);
          }}
          aiTransformAvailable={aiTransformAvailable}
          onAiTransformChange={setAiTransformAvailable}
          feedMode={feedMode}
          onFeedModeChange={(mode) => {
            setFeedLoading(true);
            setFeedMode(mode);
          }}
          entry={entry}
          onEntryChange={setEntry}
        />

        {entry === "intro" ? (
          <IntroScreen onStart={() => setEntry("signup")} onSkip={() => setEntry("signup")} />
        ) : (
          <SignUpScreen
            onBack={() => setEntry("intro")}
            onDone={(babyNickname) => {
              setEntry("app");
              navigate("timeline");
              setToast(babyNickname + " として はじめました");
            }}
          />
        )}
      </div>
    );
  }

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
        entry={entry}
        onEntryChange={setEntry}
      />

      <div className="eg-layout">
        <div className="eg-layout__left">
          <LeftRail current={view} onNavigate={navigate} />
        </div>

        <main className="eg-center">
          {showPublicProfile ? (
            <PublicProfileScreen
              profile={publicProfile}
              activity={publicActivity}
              loading={publicLoading}
              activityLoading={publicActivityLoading}
              tab={publicTab}
              likePending={likePending}
              onTabChange={(next) => {
                setPublicTab(next);
                if (publicPersonaId) {
                  void loadPublicActivity(publicPersonaId, next);
                }
              }}
              onToggleLike={(next) => void toggleLike(next)}
              onOpenBubble={openBubbleFromProfile}
              onBack={() => {
                closeProfile();
                setView(publicBackTo);
              }}
            />
          ) : null}

          {!showPublicProfile && view === "favorites" ? (
            <FavoritesScreen
              baby={likedBaby}
              mother={likedMother}
              loading={likedLoading}
              pendingId={unlikingId}
              onOpenProfile={(personaId) => void openProfile(personaId)}
              onUnlike={(personaId) => void unlike(personaId)}
            />
          ) : null}

          {!showPublicProfile && !showTimeline && view !== "profile" && view !== "favorites" ? (
            <PlaceholderScreen view={view} />
          ) : null}

          {!showPublicProfile && view === "profile" ? (
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
                navigate("favorites");
              }}
              onCompose={() => setCompose({ kind: "bubble" })}
            />
          ) : null}

          {showTimeline && detailBubbleId === null ? (
            <TimelineScreen
              feed={feed}
              loading={showFeedSkeleton}
              onOpenBubble={openBubble}
              onOpenProfile={(personaId) => void openProfile(personaId)}
              onRefresh={() => {
                setFeedLoading(true);
                void loadFeed();
              }}
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
                onOpenProfile={(personaId) => void openProfile(personaId)}
                onReactToBubble={(bubbleId, reaction) => void reactToBubble(bubbleId, reaction)}
                onReactToSoothe={(sootheId, authorKind, reaction) =>
                  void reactToSoothe(sootheId, authorKind, reaction)
                }
                onOpenSoothe={openReply}
                onDelete={(bubbleId) => void removeBubble(bubbleId)}
              />
            )
          ) : null}

          {/*
            中央の右下。押すと右の列が投稿パネルに入れ替わる。
            高さ 0 のスロットに入れて下端へ固定する（中身の長さで位置が動かないように）
          */}
          {compose === null ? (
            <div className="eg-fab-slot">
              <button
                type="button"
                className={cx("eg-bubble-fab", "t-button")}
                onClick={() => setCompose({ kind: "bubble" })}
              >
                <IconPen />
                バブる
              </button>
            </div>
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
