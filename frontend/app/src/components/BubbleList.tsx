import type { ComponentProps } from "react";
import type { Bubble } from "../data/types";
import { BubbleCard } from "./BubbleCard";

// 40ms × 6 = 240ms。長い一覧でも下のカードの表示を待たせない（DESIGN.md §7.2）。
const MAX_STAGGER_STEPS = 6;

type BubbleListProps = Pick<ComponentProps<typeof BubbleCard>, "onOpen" | "onOpenProfile" | "onReact"> & {
  readonly bubbles: readonly Bubble[];
};

export function BubbleList({ bubbles, onOpen, onOpenProfile, onReact }: BubbleListProps) {
  return (
    <div className="eg-feed-list">
      {bubbles.map((bubble, index) => (
        <BubbleCard
          key={bubble.id}
          bubble={bubble}
          index={Math.min(index, MAX_STAGGER_STEPS)}
          onOpen={onOpen}
          onOpenProfile={onOpenProfile}
          onReact={onReact}
        />
      ))}
    </div>
  );
}
