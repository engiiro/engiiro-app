import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TimelineScreen } from "../src/screens/TimelineScreen";
import type { Bubble } from "../src/data/types";

function bubble(id: string): Bubble {
  return {
    id, author: { id: "author-" + id, kind: "baby", nickname: "なまえ" + id },
    body: "本文" + id, createdAt: "2026-09-01T00:00:00Z", affinity: 0,
    sootheCount: 0, isMine: false, reactions: { counts: {}, mine: {} },
  };
}

describe("timeline sections", () => {
  it("keeps section order, stagger limits and callback targets", () => {
    const onOpenBubble = vi.fn();
    const onOpenProfile = vi.fn();
    const onReact = vi.fn();
    render(<TimelineScreen
      feed={{ recommended: Array.from({ length: 8 }, (_, index) => bubble(String(index))), rest: [bubble("rest")] }}
      loading={false} onOpenBubble={onOpenBubble} onOpenProfile={onOpenProfile}
      onReact={onReact} onRefresh={vi.fn()} onCompose={vi.fn()} />);
    const recommended = screen.getByRole("region", { name: "おなじくらい つかれてる子" });
    const rest = screen.getByRole("region", { name: "そのほかの バブル" });
    const cards = within(recommended).getAllByRole("article");
    expect(cards).toHaveLength(8);
    expect(cards[6].style.animationDelay).toBe(cards[7].style.animationDelay);
    expect(within(rest).getByRole("article").style.animationDelay).toBe(cards[0].style.animationDelay);
    fireEvent.click(within(cards[0]).getByRole("button", { name: /本文0/ }));
    expect(onOpenBubble).toHaveBeenCalledWith("0");
    fireEvent.click(within(cards[0]).getByRole("button", { name: /なまえ0/ }));
    expect(onOpenProfile).toHaveBeenCalledWith("author-0");
    fireEvent.click(within(cards[0]).getByRole("button", { name: /おぎゃー/ }));
    expect(onReact).toHaveBeenCalledWith("0", "ogya");
  });
});
