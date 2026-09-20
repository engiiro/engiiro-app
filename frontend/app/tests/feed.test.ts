import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchEmptyFeed, fetchFeed } from "../src/data/api";
import type { FeedResult } from "../src/data/api";
import { useFeed } from "../src/lib/useFeed";

vi.mock("../src/data/api", () => ({ fetchFeed: vi.fn(), fetchEmptyFeed: vi.fn() }));

const emptyFeed: FeedResult = { recommended: [], rest: [] };

function pendingFeed() {
  let resolve!: (feed: FeedResult) => void;
  const promise = new Promise<FeedResult>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.mocked(fetchFeed).mockReset().mockResolvedValue(emptyFeed);
  vi.mocked(fetchEmptyFeed).mockReset().mockResolvedValue(emptyFeed);
});

describe("feed loading", () => {
  it("loads once on mount and distinguishes empty results from errors", async () => {
    const { result } = renderHook(() => useFeed("normal"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchFeed).toHaveBeenCalledTimes(1);
    expect(result.current.feed).toEqual(emptyFeed);
    expect(result.current.error).toBe(false);
  });

  it("keeps the current cards during refresh but shows loading for an explicit reload", async () => {
    const { result } = renderHook(() => useFeed("normal"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    for (const operation of ["refresh", "reload"] as const) {
      const pending = pendingFeed();
      vi.mocked(fetchFeed).mockReturnValueOnce(pending.promise);
      let completion!: Promise<void>;
      act(() => { completion = result.current[operation](); });
      expect(result.current.loading).toBe(operation === "reload");
      expect(result.current.feed).toEqual(emptyFeed);
      await act(async () => { pending.resolve(emptyFeed); await completion; });
      expect(result.current.loading).toBe(false);
    }
  });

  it("recovers from a failed request on retry", async () => {
    vi.mocked(fetchFeed).mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useFeed("normal"));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.loading).toBe(false);
    await act(async () => { await result.current.reload(); });
    expect(result.current.error).toBe(false);
    expect(result.current.feed).toEqual(emptyFeed);
  });

  it("preserves the loading scenario without issuing a request", () => {
    const { result } = renderHook(() => useFeed("loading"));
    expect(result.current.loading).toBe(true);
    expect(fetchFeed).not.toHaveBeenCalled();
    expect(fetchEmptyFeed).not.toHaveBeenCalled();
  });

  it("uses the empty scenario source", async () => {
    const { result } = renderHook(() => useFeed("empty"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchEmptyFeed).toHaveBeenCalledTimes(1);
    expect(fetchFeed).not.toHaveBeenCalled();
  });
});
