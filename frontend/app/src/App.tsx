import { useCallback, useEffect, useState } from "react";

import {
  deleteBubble,
  fetchBubbleDetail,
  fetchEmptyFeed,
  fetchFeed,
  markRead,
  toggleReaction,
} from "./data/api";
import type { FeedResult } from "./data/api";
import { ME } from "./data/personas";
import { reactionTargetOfSoothe } from "./data/reactions";
import type { BubbleDetail, PersonaKind, ReactionType } from "./data/types";
import { AppNav } from "./components/AppNav";
import type { NavTarget } from "./components/AppNav";
import { MockControls } from "./components/MockControls";
import type { FeedMode } from "./components/MockControls";
import { SkeletonFeed } from "./components/Skeleton";
import { Toast } from "./components/Toast";
import type { SootheTarget } from "./lib/soothePersonaRule";
import { useTheme } from "./lib/useTheme";
import { BubbleDetailScreen } from "./screens/BubbleDetailScreen";
import { ComposeBubbleScreen } from "./screens/ComposeBubbleScreen";
import { SootheModal } from "./screens/SootheModal";
import { TimelineScreen } from "./screens/TimelineScreen";
import "./App.css";

/*
 * 画面の入れ替えと、モックの状態をまとめて持つ場所。
 *
 * 対象は S2 タイムライン / S3 バブル作成 / S4 バブル詳細 / S5 あやすモーダル。
 * S1・S6・S7・S8 は今回の対象外なので、そこへの導線も置いていない。
 *
 * データの読み書きは必ず data/api.ts を通す。ここで直接ダミーデータを書き換えない
 * （実 API に差し替えたときに、この層を直さなくて済むようにするため）。
 */

type Screen =
  | { readonly name: "timeline" }
  | { readonly name: "compose" }
  | { readonly name: "detail"; readonly bubbleId: string };

export function App() {
  const { theme, setTheme } = useTheme();
  const [aiAvailable, setAiAvailable] = useState(true);
  const [feedMode, setFeedMode] = useState<FeedMode>("normal");

  const [screen, setScreen] = useState<Screen>({ name: "timeline" });
  const [feed, setFeed] = useState<FeedResult | null>(null);
  const [feedLoading, setFeedLoading] = useState(true);
  const [detail, setDetail] = useState<BubbleDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sootheTarget, setSootheTarget] = useState<SootheTarget | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const loadFeed = useCallback(async () => {
    const result = feedMode === "empty" ? await fetchEmptyFeed() : await fetchFeed();
    setFeed(result);
    setFeedLoading(false);
  }, [feedMode]);

  useEffect(() => {
    if (feedMode === "loading") {
      // モック操作で「読み込み中」を止めて見ている間は取得しない
      return;
    }
    /*
     * 外部（ここではモックの API 層）からの取得なので effect で行う。
     * lint は「effect の中で setState するな」と言うが、取得の完了は
     * イベントとして表せないため、この1か所だけ抑止している。
     */
    // oxlint-disable-next-line react/set-state-in-effect
    void loadFeed();
  }, [feedMode, loadFeed]);

  // 読み込み中の見た目は、取得中かモック操作のどちらかで決まる
  const showFeedSkeleton = feedLoading || feedMode === "loading";

  // 画面を入れ替えたら先頭に戻す。前の画面のスクロール位置が残ると、
  // 開いた直後に見出しも入力欄も見えない状態になる
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [screen]);

  const loadDetail = useCallback(async (bubbleId: string) => {
    setDetailLoading(true);
    const result = await fetchBubbleDetail(bubbleId);
    setDetail(result);
    setDetailLoading(false);
  }, []);

  const openBubble = useCallback(
    (bubbleId: string) => {
      markRead(bubbleId);
      setScreen({ name: "detail", bubbleId });
      void loadDetail(bubbleId);
    },
    [loadDetail],
  );

  const backToTimeline = useCallback(() => {
    setScreen({ name: "timeline" });
    setDetail(null);
    if (feedMode !== "loading") {
      setFeedLoading(true);
      void loadFeed();
    }
  }, [feedMode, loadFeed]);

  const onNavigate = useCallback(
    (target: NavTarget) => {
      if (target === "timeline") {
        backToTimeline();
        return;
      }
      setScreen({ name: "compose" });
    },
    [backToTimeline],
  );

  const toggleBubbleReaction = useCallback(
    async (bubbleId: string, reaction: ReactionType) => {
      await toggleReaction({
        target: { type: "bubble", id: bubbleId },
        targetKind: "bubble",
        reaction,
      });
      if (screen.name === "detail") {
        await loadDetail(bubbleId);
      } else if (feedMode !== "loading") {
        await loadFeed();
      }
    },
    [feedMode, loadDetail, loadFeed, screen.name],
  );

  const toggleSootheReaction = useCallback(
    async (sootheId: string, authorKind: PersonaKind, reaction: ReactionType) => {
      await toggleReaction({
        target: { type: "soothe", id: sootheId },
        // 対象の種類は発信ペルソナから決まる。ここで種類を選び直さない
        targetKind: reactionTargetOfSoothe(authorKind),
        reaction,
      });
      if (screen.name === "detail") {
        await loadDetail(screen.bubbleId);
      }
    },
    [loadDetail, screen],
  );

  const removeBubble = useCallback(
    async (bubbleId: string) => {
      await deleteBubble(bubbleId);
      setToast("バブルを けしました");
      backToTimeline();
    },
    [backToTimeline],
  );

  return (
    <div className="eg-app">
      <MockControls
        theme={theme}
        onThemeChange={setTheme}
        aiAvailable={aiAvailable}
        onAiAvailableChange={setAiAvailable}
        feedMode={feedMode}
        onFeedModeChange={(mode) => {
          setFeedLoading(true);
          setFeedMode(mode);
        }}
      />

      <main className="eg-main">
        {screen.name === "timeline" ? (
          <TimelineScreen
            feed={feed}
            loading={showFeedSkeleton}
            onOpenBubble={openBubble}
            onToggleReaction={(bubbleId, reaction) => void toggleBubbleReaction(bubbleId, reaction)}
            onCompose={() => setScreen({ name: "compose" })}
          />
        ) : null}

        {screen.name === "compose" ? (
          <ComposeBubbleScreen
            me={ME}
            aiAvailable={aiAvailable}
            onBack={backToTimeline}
            onPosted={() => {
              setToast("ぽいっと できました");
              backToTimeline();
            }}
          />
        ) : null}

        {screen.name === "detail" ? (
          detailLoading || detail === null ? (
            <div className="eg-column eg-main__loading">
              <SkeletonFeed count={1} />
            </div>
          ) : (
            <BubbleDetailScreen
              detail={detail}
              onBack={backToTimeline}
              onToggleBubbleReaction={(bubbleId, reaction) =>
                void toggleBubbleReaction(bubbleId, reaction)
              }
              onToggleSootheReaction={(sootheId, authorKind, reaction) =>
                void toggleSootheReaction(sootheId, authorKind, reaction)
              }
              onOpenSoothe={setSootheTarget}
              onDelete={(bubbleId) => void removeBubble(bubbleId)}
            />
          )
        ) : null}

        <div className="eg-bottom-spacer" aria-hidden="true" />
      </main>

      <AppNav current={screen.name === "compose" ? "compose" : "timeline"} onNavigate={onNavigate} />

      {sootheTarget ? (
        <SootheModal
          target={sootheTarget}
          me={ME}
          aiAvailable={aiAvailable}
          onClose={() => setSootheTarget(null)}
          onSoothed={() => {
            setSootheTarget(null);
            setToast("あやしました");
            void loadDetail(sootheTarget.bubbleId);
          }}
        />
      ) : null}

      {toast ? <Toast message={toast} onDone={() => setToast(null)} /> : null}
    </div>
  );
}
