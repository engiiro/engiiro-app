import { useCallback, useEffect, useState } from "react";
import { fetchEmptyFeed, fetchFeed } from "../data/api";
import type { FeedResult } from "../data/api";
import type { FeedMode } from "./mockScenario";

/** フィードの取得と表示状態。画面遷移や認証の判断は呼び出し側が持つ。 */
export function useFeed(mode: FeedMode) {
  const [feed, setFeed] = useState<FeedResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // リアクション後は一覧を残して再取得する。通常の再読み込みだけ reload で skeleton に戻す。
  const refresh = useCallback(async () => {
    try {
      const result = mode === "empty" ? await fetchEmptyFeed() : await fetchFeed();
      setFeed(result);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [mode]);

  const reload = useCallback(async () => {
    setLoading(true);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    if (mode === "loading") {
      return;
    }
    // oxlint-disable-next-line react/set-state-in-effect
    void refresh();
  }, [mode, refresh]);

  return { feed, loading: loading || mode === "loading", error, refresh, reload };
}
