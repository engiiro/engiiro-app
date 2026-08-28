import { useCallback, useEffect, useRef, useState } from "react";

import {
  addReaction,
  deleteBubble,
  fetchBubbleDetail,
  fetchEmptyFeed,
  fetchFeed,
  fetchLikedPersonas,
  fetchMe,
  fetchMyActivity,
  fetchMyProfile,
  fetchPublicActivity,
  fetchPublicProfile,
  fetchSootheDetail,
  logout,
  setAiEvaluateAvailability,
  setLiked,
  setSessionGuest,
} from "./data/api";
import type { AddReactionInput, FeedResult } from "./data/api";
import { REACTION_MAX_PER_USER } from "./data/constants";
import { reactionTargetOfSoothe } from "./data/reactions";
import type {
  BubbleDetail,
  ActivityEntry,
  ActivityTab,
  Me,
  MyProfile,
  PersonaKind,
  PublicPersona,
  PublicProfile,
  ReactionType,
  SootheDetail,
} from "./data/types";
import { Button } from "./components/Button";
import { EmptyState } from "./components/EmptyState";
import { LeftRail } from "./components/LeftRail";
import type { CenterView } from "./components/LeftRail";
import { LoginPrompt } from "./components/LoginPrompt";
import type { GuestAction } from "./components/LoginPrompt";
import { NoteBox } from "./components/NoteBox";
import { RightRail } from "./components/RightRail";
import { ScreenHeader } from "./components/ScreenHeader";
import { SkeletonFeed } from "./components/Skeleton";
import { Toast } from "./components/Toast";
import { IconPen } from "./components/icons";
import type { SootheTarget } from "./lib/soothePersonaRule";
import { cx } from "./lib/cx";
import { readMockScenario } from "./lib/mockScenario";
import type { EntryStage } from "./lib/mockScenario";
import { useTheme } from "./lib/useTheme";
import { BubbleDetailScreen } from "./screens/BubbleDetailScreen";
import { ComposePanel } from "./screens/ComposePanel";
import type { ComposeMode } from "./screens/ComposePanel";
import { FavoritesScreen } from "./screens/FavoritesScreen";
import { IntroScreen } from "./screens/IntroScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { MyProfileScreen } from "./screens/MyProfileScreen";
import { PlaceholderScreen } from "./screens/PlaceholderScreen";
import { PublicProfileScreen } from "./screens/PublicProfileScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { SignUpScreen } from "./screens/SignUpScreen";
import { SootheDetailScreen } from "./screens/SootheDetailScreen";
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

/**
 * 中央に出せる場所ひとつぶん。中身ではなく「どこに居るか」だけを持つ。
 *
 *   view   … 左サイドで選ぶ画面（ホーム／おきにいり／プロフィール…）
 *   public … S6 他人の公開プロフィール
 *   bubble … バブルの詳細
 *   soothe … あやすの詳細
 */
type Location =
  | { readonly kind: "view"; readonly view: CenterView }
  | { readonly kind: "public"; readonly personaId: string }
  | { readonly kind: "bubble"; readonly id: string }
  | { readonly kind: "soothe"; readonly id: string };

/** 引き直した詳細の中身。画面の出しわけは kind だけで決める */
type OpenDetail =
  | { readonly kind: "bubble"; readonly value: BubbleDetail }
  | { readonly kind: "soothe"; readonly value: SootheDetail };

/** 履歴の底。ここより前には戻れない */
const HOME: Location = { kind: "view", view: "timeline" };

/** 左サイドの選択の見た目に使う「いまの画面」。潜っていても、来た列が光ったままになる */
function currentView(history: readonly Location[]): CenterView {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const entry = history[i];
    if (entry.kind === "view") {
      return entry.view;
    }
  }
  return "timeline";
}

export function App() {
  const { theme, setTheme } = useTheme();

  /*
   * モックの見え方は URL で決める（人間の決定、2026-08-28）。
   * 読むのは起動時の1回だけ。あとから URL を書き換えても、この画面は追いかけない
   * （追いかける仕組みを作ると、実 API に差し替えるときに外す量が増える）。
   */
  const [scenario] = useState(() => readMockScenario(window.location.search));

  /*
   * AI は「評価」と「生成」を別に扱う（PO 回答 2026-08-25、Issue #19）。
   *   評価が使えない … バブルもあやすもできない（NFR-003）
   *   生成が使えない … 投稿とあやすは続けられる（NFR-001）
   */
  const aiEvaluateAvailable = scenario.aiEvaluate;
  const aiTransformAvailable = scenario.aiTransform;
  const feedMode = scenario.feed;

  /* サーバ側の評価も落ちている扱いにする（投稿の可否が評価に依存するため） */
  useEffect(() => {
    setAiEvaluateAvailability(scenario.aiEvaluate);
  }, [scenario.aiEvaluate]);

  /* ?theme= が付いていたら、その選択を1回だけ書き込む。以後は保存された選択が勝つ */
  useEffect(() => {
    if (scenario.theme !== null) {
      setTheme(scenario.theme);
    }
  }, [scenario.theme, setTheme]);

  /*
   * 画面の入り口（人間の指示、2026-08-25）。
   *   intro  … 登録の前に読む説明。サーバへ何も送らない
   *   signup … S1 アカウント登録
   *   app    … 本編
   *
   * モックなので既定は本編。説明と登録は ?entry=intro などで見る。
   * 本物では、未登録なら intro から始まり、登録が済めば app にしか入らない
   * （認証は Issue #7 で未確定）。
   */
  const [entry, setEntry] = useState<EntryStage>(scenario.entry);

  /*
   * ログインしているかどうか（人間の指示、2026-08-26）。
   *
   * えんじいろは、アカウントが無くても読める。
   * アカウントが要るのは、書く・反応する・大好きにする、および本人専用の画面
   * （FR-AUTH-001/002 の線引き）。
   *
   * ★ ゲストのときにボタンを消したり disabled にしたりしない。
   *   押せるままにして、押したら「なぜ要るのか」を出す。
   *   何ができないのかを、押す前から想像させない。
   *
   * 判定は下の guard に集約する。画面ごとに if を書かない。
   *
   * 既定はゲスト（人間の指示、2026-08-26）。初めて来た人と同じ状態から始める。
   */
  const [isGuest, setIsGuest] = useState(true);

  /*
   * 閲覧者自身。モックデータ（public/data/profile-me.json）の読み込みが終わってから入る。
   * 画面が data/personas.ts の ME を直接見ないための状態。
   * 直接見ていると、読み込みが終わるまで空のニックネームが出る。
   */
  const [me, setMe] = useState<Me | null>(null);
  /*
   * 起動時の読み込みが失敗したか（public/data/*.json が読めない等）。
   * 失敗を握りつぶさず、やり直せるようにする（人間の指摘、モックデータ取得失敗時に
   * 画面が読み込み中のまま固まっていた）。
   */
  const [bootError, setBootError] = useState(false);
  const [bootAttempt, setBootAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((result) => {
        if (!cancelled) {
          setMe(result);
          setBootError(false);
          // トークンが残っていて本人の情報が取れたなら、再訪でもログイン状態から始める。
          // fetchMe自身がトークン切れを検知したときはゲスト用の空ペルソナに落としているので、
          // ニックネームの有無で判定できる。
          setIsGuest(result.baby.nickname === "" && result.mother.nickname === "");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBootError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bootAttempt]);


  const [gate, setGate] = useState<GuestAction | null>(null);

  /*
   * 通ってきた道（人間の指摘、2026-08-27）。
   *
   * 以前は「左サイドの選択（view）」「詳細の積み重ね（detailStack）」
   * 「S6 を閉じたときの戻り先（publicBackTo）」の3つを別々に持っていた。
   * そのため おきにいり → 公開プロフィール → バブル と潜ったあと、
   * 「もどる」が **ホームに着地する** ことになっていた。
   * 途中で view を timeline に書き換えていて、来た道がどこにも残っていなかったため。
   *
   * ★ 3つを1本の配列にまとめる。中央に出せるものは、左サイドの画面も
   *   公開プロフィールも詳細も、すべて等しく「場所」として1段積む。
   *   「もどる」は種類を問わず1段外すだけ。戻り先を覚える変数はもう要らない。
   *
   * 底は常にホーム。左サイドを押したときだけ、積み上げを捨てて底から始め直す
   * （タブを押したのに前の道が残っていると、そのほうが驚く）。
   *
   * 入るのは種別と id だけ。中身は着くたびに引き直す
   * （潜っているあいだにリアクションや返信で数が変わるので、積んだ中身は当てにしない）。
   */
  const [history, setHistory] = useState<readonly Location[]>([HOME]);
  const here = history[history.length - 1];
  const view = currentView(history);

  const [feed, setFeed] = useState<FeedResult | null>(null);
  const [feedLoading, setFeedLoading] = useState(true);
  /** フィードの読み込みそのものが失敗したか。0件（空フィード）とは別の状態 */
  const [feedError, setFeedError] = useState(false);

  const [detail, setDetail] = useState<OpenDetail | null>(null);
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
  const publicPersonaId = here.kind === "public" ? here.personaId : null;
  const [publicProfile, setPublicProfile] = useState<PublicProfile | null>(null);
  const [publicLoading, setPublicLoading] = useState(true);
  const [publicTab, setPublicTab] = useState<ActivityTab>("babyBubbles");
  const [publicActivity, setPublicActivity] = useState<readonly ActivityEntry[]>([]);
  const [publicActivityLoading, setPublicActivityLoading] = useState(true);
  const [likePending, setLikePending] = useState(false);

  /*
   * S7 おきにいり ＝ 大好きな人の一覧（FR-FOLLOW-003）。
   * 「大好きにした人」だけを持つ。された側の状態は置かない（FR-FOLLOW-004/005）。
   */
  const [likedBaby, setLikedBaby] = useState<readonly PublicPersona[]>([]);
  const [likedMother, setLikedMother] = useState<readonly PublicPersona[]>([]);
  const [likedLoading, setLikedLoading] = useState(true);
  const [unlikingId, setUnlikingId] = useState<string | null>(null);

  const loadFeed = useCallback(async () => {
    try {
      const result = feedMode === "empty" ? await fetchEmptyFeed() : await fetchFeed();
      setFeed(result);
      setFeedError(false);
    } catch {
      setFeedError(true);
    } finally {
      setFeedLoading(false);
    }
  }, [feedMode]);

  useEffect(() => {
    if (feedMode === "loading") {
      return;
    }
    // oxlint-disable-next-line react/set-state-in-effect
    void loadFeed();
  }, [feedMode, loadFeed]);

  const showFeedSkeleton = feedLoading || feedMode === "loading";

  /*
   * 詳細読み込みの世代カウンタ（人間の指摘、素早く連続で開き直すと古い応答が
   * あとから勝って表示が入れ替わる競合があった）。
   * 呼ぶたびに増やし、応答が来た時点で世代が古ければその結果は捨てる。
   */
  const detailRequestRef = useRef(0);

  /*
   * 詳細を引く。
   *
   * ★ quiet は「開いている画面を消さずに引き直す」ため（人間の指摘 2026-08-27）。
   *   リアクションを押すたびに skeleton へ差し替えていたので、
   *     - 画面が 520ms（モックの通信待ち）ぶん前の画面に戻ったように見える
   *     - スクロール位置が頭に戻る
   *     - 押したボタンごと外れるので、押した瞬間の演出が1フレームで消える
   *   の3つが起きていた。着いたとき（enter）だけ skeleton を出し、
   *   引き直し（refresh）では出さない。
   */
  const loadDetail = useCallback(
    async (
      ref: Extract<Location, { kind: "bubble" | "soothe" }>,
      options?: { readonly quiet?: boolean },
    ) => {
      const requestId = (detailRequestRef.current += 1);
      if (!options?.quiet) {
        setDetailLoading(true);
      }
      if (ref.kind === "bubble") {
        const result = await fetchBubbleDetail(ref.id);
        if (requestId !== detailRequestRef.current) {
          return;
        }
        setDetail(result ? { kind: "bubble", value: result } : null);
      } else {
        const result = await fetchSootheDetail(ref.id);
        if (requestId !== detailRequestRef.current) {
          return;
        }
        setDetail(result ? { kind: "soothe", value: result } : null);
      }
      setDetailLoading(false);
    },
    [],
  );

  /*
   * 以下の読み込みは、どれも quiet を取る。
   *
   * ★ quiet ＝「開いている中身を skeleton に差し替えずに引き直す」。
   *   着いたとき（enter）は skeleton を出す。まだ何も無いところに枠を出すのは正しい。
   *   すでに読めているものを引き直すとき（refresh / 大好きの解除）に skeleton へ戻すと、
   *   押した反応のはずが画面の入れ替わりに見え、スクロール位置も飛ぶ
   *   （人間の指摘 2026-08-27。リアクションで詳細が一瞬前の画面に戻って見えた件と同じ）。
   */
  const loadProfile = useCallback(async (options?: { readonly quiet?: boolean }) => {
    if (!options?.quiet) {
      setProfileLoading(true);
    }
    setProfile(await fetchMyProfile());
    setProfileLoading(false);
  }, []);

  /*
   * ログインの状態を切り替える。
   *
   * サーバ側にもその場で伝える。isMine は閲覧者ごとに変わる値で、
   * ゲストには「自分のバブル」も「自分のあやす」も無い。
   * effect にすると、切り替えた直後の読み込みが古い状態のまま走ることがある。
   */
  const applySession = useCallback((guest: boolean) => {
    setIsGuest(guest);
    setSessionGuest(guest);
  }, []);

  /** ログアウトして、読むだけの状態に戻る */
  const leave = useCallback(async () => {
    await logout();
    applySession(true);
    setCompose(null);
    setToast("ログアウトしました。よむのは つづけられます");
    // 本人専用の画面を開いたままにしない（FR-PERSONA-005 / FR-FOLLOW-003）
    setProfile(null);
    setLikedBaby([]);
    setLikedMother([]);
    // 通ってきた道ごと捨てる。本人専用の画面へ「もどる」で帰れてはいけない
    setHistory([HOME]);
    setDetail(null);
    setPublicProfile(null);
    // 「自分のバブル」の印が残らないよう、閲覧者が変わったら読み直す
    setFeedLoading(true);
    await loadFeed();
  }, [applySession, loadFeed]);

  /**
   * ゲストなら止めて、理由を出す。ログイン中ならそのまま通す。
   *
   * 止めた操作を覚えておいて、ログイン後に代わりに実行することはしない。
   * 本人が押していない操作が、あとから勝手に起きるのを避ける
   * （リアクションは取り消せない）。
   *
   * ここはあくまで画面側の入口。本物は backend が同じ判定をする（FR-AUTH-001）。
   */
  const guard = useCallback(
    (action: GuestAction, run: () => void) => {
      if (isGuest) {
        setGate(action);
        return;
      }
      run();
    },
    [isGuest],
  );

  const loadLiked = useCallback(async (options?: { readonly quiet?: boolean }) => {
    if (!options?.quiet) {
      setLikedLoading(true);
    }
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
      /* 1行 外しただけで一覧ごと skeleton に戻さない */
      await loadLiked({ quiet: true });
    },
    [loadLiked],
  );

  const loadActivity = useCallback(
    async (tab: ActivityTab, options?: { readonly quiet?: boolean }) => {
      if (!options?.quiet) {
        setActivityLoading(true);
      }
      setActivity(await fetchMyActivity(tab));
      setActivityLoading(false);
    },
    [],
  );

  /**
   * S6 の中身を引く。
   *
   * ★ 渡すのはペルソナ id ひとつ。どのペルソナから来たかも、
   *   その人のもう一方のペルソナも、この関数は受け取らない（FR-PERSONA-004）。
   *   一覧の初期タブは、開いたペルソナの種類だけで決まる。
   */
  const loadPublicProfile = useCallback(
    async (personaId: string) => {
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
    [],
  );

  const loadPublicActivity = useCallback(
    async (personaId: string, tab: ActivityTab, options?: { readonly quiet?: boolean }) => {
      if (!options?.quiet) {
        setPublicActivityLoading(true);
      }
      setPublicActivity(await fetchPublicActivity(personaId, tab));
      setPublicActivityLoading(false);
    },
    [],
  );

  /**
   * その場所に着いたときの読み込み。
   *
   * ★ 進むときと戻るときで、同じ関数を通す。
   *   戻り先を「積んだときの中身」で描き直すと、潜っているあいだに増えた
   *   リアクションやあやすが消えたように見える。着くたびに引き直す。
   */
  const enter = useCallback(
    (location: Location) => {
      if (location.kind === "view") {
        if (location.view === "timeline" && feedMode !== "loading") {
          setFeedLoading(true);
          void loadFeed();
        }
        if (location.view === "profile") {
          // 評価が落ちている／戻った直後でもその時点の状態を出したいので、開くたびに引き直す
          void loadProfile();
          void loadActivity(activityTab);
        }
        if (location.view === "favorites") {
          void loadLiked();
        }
        return;
      }
      if (location.kind === "public") {
        void loadPublicProfile(location.personaId);
        return;
      }
      void loadDetail(location);
    },
    [
      activityTab,
      feedMode,
      loadActivity,
      loadDetail,
      loadFeed,
      loadLiked,
      loadProfile,
      loadPublicProfile,
    ],
  );

  /** 1段 潜る。どこから来たかは配列が覚えるので、呼ぶ側は行き先だけを渡す */
  const push = useCallback(
    (location: Location) => {
      setHistory((current) => [...current, location]);
      enter(location);
    },
    [enter],
  );

  /**
   * 「もどる」。通ってきた道を1段だけ外す。
   *
   * 詳細から一覧へ、公開プロフィールから おきにいりへ、と種類を問わず同じ動き。
   * 底（ホーム）に居るときは何もしない。
   */
  const back = useCallback(() => {
    if (history.length <= 1) {
      return;
    }
    const rest = history.slice(0, -1);
    setHistory(rest);
    setDetail(null);
    enter(rest[rest.length - 1]);
  }, [enter, history]);

  /** 左サイド。押されたら、通ってきた道は捨てて底から始め直す */
  const navigate = useCallback(
    (next: CenterView) => {
      // 本人専用の画面（FR-FOLLOW-003 / FR-PERSONA-005）はゲストでは開かない
      if (isGuest && (next === "profile" || next === "favorites")) {
        setGate(next);
        return;
      }
      const location: Location = { kind: "view", view: next };
      setHistory(next === "timeline" ? [HOME] : [HOME, location]);
      setDetail(null);
      setPublicProfile(null);
      enter(location);
    },
    [enter, isGuest],
  );

  /**
   * S6 他人の公開プロフィールへ。
   * どのペルソナから来たかは渡さない（FR-PERSONA-004）。積むのは id ひとつだけ。
   */
  const openProfile = useCallback(
    (personaId: string) => {
      push({ kind: "public", personaId });
    },
    [push],
  );

  /** バブルの詳細へ */
  const openBubble = useCallback(
    (bubbleId: string) => {
      push({ kind: "bubble", id: bubbleId });
    },
    [push],
  );

  /** あやすの詳細へ（人間の指示、2026-08-26）。バブルを経由しない */
  const openSootheDetail = useCallback(
    (sootheId: string) => {
      push({ kind: "soothe", id: sootheId });
    },
    [push],
  );

  /**
   * いま居る場所だけを引き直す。移動はしない。
   * 開いている画面は消さない（skeleton に差し替えない）。引き直しは、
   * 押した反応の続きとして起きるものなので、画面が入れ替わって見えてはいけない。
   */
  const refresh = useCallback(async () => {
    if (here.kind === "bubble" || here.kind === "soothe") {
      await loadDetail(here, { quiet: true });
      return;
    }
    if (here.kind === "public") {
      // 一覧の切り替えは そのまま。開いていたタブが勝手に戻らないようにする
      await loadPublicActivity(here.personaId, publicTab, { quiet: true });
      return;
    }
    if (here.view === "profile") {
      await Promise.all([
        loadProfile({ quiet: true }),
        loadActivity(activityTab, { quiet: true }),
      ]);
      return;
    }
    if (here.view === "favorites") {
      await loadLiked({ quiet: true });
      return;
    }
    if (feedMode !== "loading") {
      await loadFeed();
    }
  }, [
    activityTab,
    feedMode,
    here,
    loadActivity,
    loadDetail,
    loadFeed,
    loadLiked,
    loadProfile,
    loadPublicActivity,
    publicTab,
  ]);

  /*
   * addReaction の失敗（max_reached 等）は Issue #19 で backend と共有済みの区分
   * （「6回目は保存しない。返す区分は max_reached」）。ボタンの disabled は
   * まだ反映されていないローカルの mine 値を見ているため、往復中に連打すると
   * サーバ側では正しく弾かれているのに画面には何も出ない状態になっていた
   * （人間の指摘）。ここで理由を拾って一言だけ出す。
   */
  const react = useCallback(
    async (input: AddReactionInput) => {
      const result = await addReaction(input);
      if (!result.ok && result.reason === "max_reached") {
        setToast("もう " + String(REACTION_MAX_PER_USER) + "回 おくったよ");
      }
      await refresh();
    },
    [refresh],
  );

  const removeBubble = useCallback(
    async (bubbleId: string) => {
      await deleteBubble(bubbleId);
      setToast("バブルを けしました");
      /*
       * 詳細を開いたまま消したときだけ、来た道を1段戻る。
       * 一覧（S8 など）から消したときは画面を移さない。
       * 消えたことがその場で分かるように、いまの場所を引き直すだけにする。
       */
      if (here.kind === "bubble") {
        back();
        return;
      }
      await refresh();
    },
    [back, here, refresh],
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

  /*
   * ★ 「プロフィールの一覧から開く」ための専用の関数を置かなくなった
   *   （人間の指摘、2026-08-27）。
   *   以前は、開く前に公開プロフィールを閉じて view を timeline へ書き換えていた。
   *   その書き換えが、まさに「もどるとホームに着く」の原因だった。
   *   いまはどの画面から開いても push するだけで、来た道は履歴に残る。
   */

  const openReply = useCallback(
    (target: SootheTarget) => {
      /*
       * ゲストに出す文も、返信先で変える（人間の決定 2026-08-28）。
       * お母さんのあやすへ返せるのは赤ちゃんだけで、そこでの操作は「バブる」。
       * 「あやすには、アカウントが いります」と出すと、押したボタンと文が合わない。
       */
      const gateAction =
        target.kind === "soothe" && target.authorKind === "mother" ? "bubble" : "soothe";
      guard(gateAction, () => setCompose({ kind: "reply", target }));
    },
    [guard],
  );

  const startBubble = useCallback(() => {
    guard("bubble", () => setCompose({ kind: "bubble" }));
  }, [guard]);

  /*
   * ニックネームを変えたあと（人間の指示、2026-08-28）。
   *
   * ★ 受け取るのは**サーバが返した保存後の値**。ここで文字列を組み立て直さない。
   * ★ 自分の名前は自分の投稿・あやす・プロフィールにも出ている。
   *   それらはサーバから引いたものなので、me を差し替えるだけでは古い名前が残る。
   *   いま開いている画面を引き直して、サーバ側の名前に合わせる。
   *   引き直しは quiet（skeleton に戻さない）なので、画面は入れ替わって見えない。
   */
  const applyRename = useCallback(
    async (next: Me) => {
      setMe(next);
      setToast("なまえを かえました");
      await refresh();
    },
    [refresh],
  );

  const reactToBubbleGuarded = useCallback(
    (bubbleId: string, reaction: ReactionType) => {
      guard("react", () => {
        void react({ target: { type: "bubble", id: bubbleId }, targetKind: "bubble", reaction });
      });
    },
    [guard, react],
  );

  const reactToSootheGuarded = useCallback(
    (sootheId: string, authorKind: PersonaKind, reaction: ReactionType) => {
      guard("react", () => {
        void react({
          target: { type: "soothe", id: sootheId },
          // 対象の種類は発信ペルソナから決まる。ここで種類を選び直さない
          targetKind: reactionTargetOfSoothe(authorKind),
          reaction,
        });
      });
    },
    [guard, react],
  );

  // 場所が変わったら中央を先頭へ戻す
  useEffect(() => {
    document.querySelector(".eg-center")?.scrollTo({ top: 0 });
    // 潜るたび・戻るたびに先頭へ。here は配列の要素そのものなので、同じ階層の移動でも変わる
  }, [here]);

  /* 詳細（バブル／あやす）を出しているか。下端に貼りつくものの出しわけに使う */
  const showDetail = here.kind === "bubble" || here.kind === "soothe";

  if (entry !== "app") {
    return (
      <div className="eg-app">
        {entry === "intro" ? (
          <IntroScreen onStart={() => setEntry("signup")} onSkip={() => setEntry("signup")} />
        ) : null}

        {entry === "login" ? (
          <LoginScreen
            onSignUp={() => setEntry("intro")}
            onGuest={() => {
              applySession(true);
              setEntry("app");
            }}
            onDone={(loggedInMe) => {
              setMe(loggedInMe);
              applySession(false);
              setEntry("app");
              navigate("timeline");
              setToast("おかえりなさい");
            }}
          />
        ) : null}

        {entry === "signup" ? (
          <SignUpScreen
            onBack={() => setEntry("intro")}
            onLogin={() => setEntry("login")}
            onGuest={() => {
              applySession(true);
              setEntry("app");
            }}
            onDone={(newMe) => {
              setMe(newMe);
              applySession(false);
              setEntry("app");
              navigate("timeline");
              setToast(newMe.baby.nickname + " として はじめました");
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className={cx("eg-app", "eg-app--shell", compose && "is-composing")}>
      {/*
        起動時の読み込み失敗（人間の指摘、public/data/*.json が読めないときに
        画面全体が無反応の読み込み中のまま固まっていた）。
        me が無いままでも読むこと自体はできるので、アプリ全体は止めずバナーで知らせる。
      */}
      {bootError ? (
        <div className="eg-column">
          <NoteBox variant="reject" role="alert" title="よみこめませんでした">
            通信が ふあんていかもしれません。
          </NoteBox>
          <Button variant="quiet" onClick={() => setBootAttempt((count) => count + 1)}>
            もう一度 ためす
          </Button>
        </div>
      ) : null}

      <div className="eg-layout">
        <div className="eg-layout__left">
          <LeftRail current={view} onNavigate={navigate} />
        </div>

        {/*
          「バブる」（人間の決定、2026-08-27「常に表示されている状態を優先」）。

          ★ フィードより **前** に置いている。見た目は中央の右下のままで、DOM 上の位置だけが違う。
            このボタンは中央の列の中に居ないので、どれだけ送っても動かない。
            ずっと画面にあるものは、読みものの流れの一部ではない。
            列の最後に置くと、キーボードだけで操作する人はカードを全部通り過ぎてからしか
            届かなかった（実測で 30 タブ以上）。いまは左サイドの直後で届く。

          ★ 中央の列（.eg-center）の外に出しているので、列をどれだけ送っても位置が変わらない。
            置き場所は CSS の grid で「2列目・下端・右寄せ」と決めている（App.css）。

          ★ 詳細を開いているあいだは出さない（人間の指摘、2026-08-26）。
            あちらは下端いっぱいの「あやす」が主操作で、そこへ重ねると押し間違える。
            下端に貼りつくものは、1画面につき1つだけにする。

          ★ 立ちのぼる3つのバブルは飾り（人間の指示、2026-08-27）。
            押せる場所でも情報でもないので aria-hidden。
            読み上げに渡るのは「バブる」の1語だけのままにする。
        */}
        {compose === null && !showDetail ? (
          <div className="eg-fab-dock">
            <button
              type="button"
              className={cx("eg-bubble-fab", "t-button")}
              onClick={() => startBubble()}
            >
              <span className="eg-bubble-fab__drift" aria-hidden="true">
                <span className="eg-bubble-fab__drop" />
                <span className="eg-bubble-fab__drop" />
                <span className="eg-bubble-fab__drop" />
              </span>
              <IconPen />
              バブる
            </button>
          </div>
        ) : null}

        <main className="eg-center">
          {here.kind === "public" ? (
            <PublicProfileScreen
              /* ゲスト向けの落とし込みは data/api.ts が済ませている（FR-AUTH-001 の境界） */
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
              onToggleLike={(next) => guard("like", () => void toggleLike(next))}
              onOpenBubble={openBubble}
              onOpenSoothe={openSootheDetail}
              /* 通ってきた道を1段戻る。おきにいりから来たなら おきにいりへ帰る */
              onBack={back}
            />
          ) : null}

          {here.kind === "view" && here.view === "favorites" ? (
            <FavoritesScreen
              baby={likedBaby}
              mother={likedMother}
              loading={likedLoading}
              pendingId={unlikingId}
              onOpenProfile={openProfile}
              onUnlike={(personaId) => void unlike(personaId)}
            />
          ) : null}

          {here.kind === "view" && here.view === "settings" ? (
            <SettingsScreen
              theme={theme}
              onThemeChange={setTheme}
              me={me}
              isGuest={isGuest}
              onRenamed={(next) => void applyRename(next)}
            />
          ) : null}

          {here.kind === "view" &&
          here.view !== "timeline" &&
          here.view !== "favorites" &&
          here.view !== "profile" &&
          here.view !== "settings" ? (
            <PlaceholderScreen view={here.view} />
          ) : null}

          {here.kind === "view" && here.view === "profile" ? (
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
              onOpenBubble={openBubble}
              onOpenSoothe={openSootheDetail}
              onDeleteBubble={(bubbleId) => void removeBubble(bubbleId)}
              onOpenFollowing={() => {
                navigate("favorites");
              }}
              onCompose={() => startBubble()}
            />
          ) : null}

          {here.kind === "view" && here.view === "timeline" ? (
            feedError ? (
              <>
                <ScreenHeader title="ホーム" />
                <div className="eg-column">
                  <EmptyState
                    lines={["よみこめませんでした。", "つうしんが ふあんていかも しれません。"]}
                    action={
                      <Button
                        onClick={() => {
                          setFeedLoading(true);
                          void loadFeed();
                        }}
                      >
                        もう一度 よみこむ
                      </Button>
                    }
                  />
                </div>
              </>
            ) : (
              <TimelineScreen
                feed={feed}
                loading={showFeedSkeleton}
                onOpenBubble={openBubble}
                onOpenProfile={openProfile}
                onRefresh={() => {
                  setFeedLoading(true);
                  void loadFeed();
                }}
                onReact={(bubbleId, reaction) => reactToBubbleGuarded(bubbleId, reaction)}
                onCompose={() => startBubble()}
              />
            )
          ) : null}

          {showDetail ? (
            detailLoading ? (
              <div className="eg-center__loading">
                <SkeletonFeed count={1} />
              </div>
            ) : detail === null ? (
              <>
                <ScreenHeader title={here.kind === "bubble" ? "バブル" : "あやす"} onBack={back} />
                <div className="eg-column">
                  <EmptyState
                    lines={["この さきは もう ありません。", "けされたか、見つからない ページです。"]}
                    action={<Button onClick={back}>もどる</Button>}
                  />
                </div>
              </>
            ) : detail.kind === "bubble" ? (
              <BubbleDetailScreen
                detail={detail.value}
                onBack={back}
                onOpenProfile={openProfile}
                onReactToBubble={(bubbleId, reaction) => reactToBubbleGuarded(bubbleId, reaction)}
                onReactToSoothe={(sootheId, authorKind, reaction) =>
                  reactToSootheGuarded(sootheId, authorKind, reaction)
                }
                onOpenSoothe={openReply}
                onOpenSootheDetail={openSootheDetail}
                onDelete={(bubbleId) => void removeBubble(bubbleId)}
              />
            ) : (
              <SootheDetailScreen
                detail={detail.value}
                onBack={back}
                onOpenProfile={openProfile}
                onOpenBubble={openBubble}
                onOpenSoothe={openSootheDetail}
                onReact={(sootheId, authorKind, reaction) =>
                  reactToSootheGuarded(sootheId, authorKind, reaction)
                }
                onReply={openReply}
              />
            )
          ) : null}

          {/*
            ボタンぶんの場所取り。中身は無い。

            ボタン自体は列の外（上の .eg-fab-dock）に居るので、これが無いと
            いちばん下まで送りきったとき、最後のカードがボタンの下に隠れる。
            親（.eg-center）に padding-bottom を戻さないための実体でもある（App.css の注記）。
          */}
          {compose === null && !showDetail ? (
            <div className="eg-fab-slot" aria-hidden="true" />
          ) : null}
        </main>

        <div className="eg-layout__right">
          {/* 閲覧者が読めるまでは開かない。ペルソナの名前が無いまま出さない */}
          {compose && me ? (
            <ComposePanel
              mode={compose}
              me={me}
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
            <RightRail
              isGuest={isGuest}
              babyNickname={me ? me.baby.nickname : ""}
              onLogin={() => setEntry("login")}
              onLogout={() => void leave()}
            />
          )}
        </div>
      </div>

      {gate ? (
        <LoginPrompt
          action={gate}
          onLogin={() => {
            setGate(null);
            setEntry("login");
          }}
          onSignUp={() => {
            setGate(null);
            setEntry("intro");
          }}
          onClose={() => setGate(null)}
        />
      ) : null}

      {toast ? <Toast message={toast} onDone={() => setToast(null)} /> : null}
    </div>
  );
}
