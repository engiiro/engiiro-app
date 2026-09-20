import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useNavigationHistory } from "../src/lib/useNavigationHistory";

describe("SNS navigation history", () => {
  it("returns through profile and favorites in order, keeping the originating sidebar selected", () => {
    const { result } = renderHook(useNavigationHistory);
    act(() => { result.current.resetHistory("favorites"); });
    act(() => { result.current.pushLocation({ kind: "public", personaId: "baby-1" }); });
    act(() => { result.current.pushLocation({ kind: "bubble", id: "bubble-1" }); });
    act(() => { result.current.pushLocation({ kind: "soothe", id: "soothe-1" }); });
    expect(result.current.view).toBe("favorites");
    for (const expected of [
      { kind: "bubble", id: "bubble-1" },
      { kind: "public", personaId: "baby-1" },
      { kind: "view", view: "favorites" },
      { kind: "view", view: "timeline" },
    ]) {
      act(() => { expect(result.current.popLocation()).toEqual(expected); });
      expect(result.current.here).toEqual(expected);
    }
    act(() => { expect(result.current.popLocation()).toBeNull(); });
    expect(result.current.view).toBe("timeline");
  });

  it("drops private history on logout and starts new sidebar navigation from home", () => {
    const { result } = renderHook(useNavigationHistory);
    act(() => { result.current.resetHistory("profile"); });
    act(() => { result.current.pushLocation({ kind: "bubble", id: "mine" }); });
    act(() => { result.current.resetHistory(); });
    act(() => { expect(result.current.popLocation()).toBeNull(); });
    expect(result.current.here).toEqual({ kind: "view", view: "timeline" });
    act(() => { result.current.resetHistory("favorites"); });
    act(() => { result.current.resetHistory("settings"); });
    act(() => { result.current.popLocation(); });
    expect(result.current.here).toEqual({ kind: "view", view: "timeline" });
  });
});
