import { useCallback, useState } from "react";
import type { CenterView } from "../components/LeftRail";

/** 履歴には行き先だけを保持する。投稿・プロフィールの内容は到着時に取り直す。 */
export type SnsLocation =
  | { readonly kind: "view"; readonly view: CenterView }
  | { readonly kind: "public"; readonly personaId: string }
  | { readonly kind: "bubble"; readonly id: string }
  | { readonly kind: "soothe"; readonly id: string };

const HOME: SnsLocation = { kind: "view", view: "timeline" };

/** 詳細へ潜っている間も、出発したサイドバー項目を選択状態にする。 */
export function currentView(history: readonly SnsLocation[]): CenterView {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const location = history[index];
    if (location.kind === "view") {
      return location.view;
    }
  }
  return "timeline";
}

/** おきにいり → 公開プロフィール → 投稿、と進んでも1段ずつ同じ道を戻る。 */
export function useNavigationHistory() {
  const [history, setHistory] = useState<readonly SnsLocation[]>([HOME]);

  const pushLocation = useCallback((location: SnsLocation) => {
    setHistory((current) => [...current, location]);
  }, []);

  const popLocation = useCallback((): SnsLocation | null => {
    if (history.length <= 1) {
      return null;
    }
    const rest = history.slice(0, -1);
    setHistory(rest);
    return rest[rest.length - 1];
  }, [history]);

  // 左サイドの選択とログアウトでは履歴をリセットし、ホームを底に残す。
  const resetHistory = useCallback((view: CenterView = "timeline"): SnsLocation => {
    const location: SnsLocation = { kind: "view", view };
    setHistory(view === "timeline" ? [HOME] : [HOME, location]);
    return location;
  }, []);

  return {
    here: history[history.length - 1],
    view: currentView(history),
    pushLocation,
    popLocation,
    resetHistory,
  };
}
