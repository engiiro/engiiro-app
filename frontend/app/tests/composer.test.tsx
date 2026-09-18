import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ComposePanel } from "../src/screens/ComposePanel";
import type { ComposeMode } from "../src/screens/ComposePanel";
import { createBubble, createSoothe, evaluateText, transformText } from "../src/data/api";
import { registerStamps } from "../src/data/stampCatalog";

vi.mock("../src/data/api", () => ({
  AiUnavailableError: class extends Error {},
  createBubble: vi.fn(), createSoothe: vi.fn(), evaluateText: vi.fn(), transformText: vi.fn(),
}));

const me = {
  baby: { id: "my-baby", kind: "baby" as const, nickname: "あかちゃん" },
  mother: { id: "my-mother", kind: "mother" as const, nickname: "おかあさん" },
};

function renderComposer(mode: ComposeMode = { kind: "bubble" }, aiEvaluateAvailable = true, aiTransformAvailable = true) {
  return render(<ComposePanel mode={mode} me={me} aiEvaluateAvailable={aiEvaluateAvailable}
    aiTransformAvailable={aiTransformAvailable} onClose={vi.fn()} onPosted={vi.fn()} />);
}

function typeBody(value: string) {
  fireEvent.change(screen.getByRole("textbox"), { target: { value } });
}

beforeEach(() => {
  registerStamps([{ id: "naku", name: "ないちゃう", shelf: "weak", imageUrl: "/naku.png" }]);
  vi.mocked(createBubble).mockReset().mockResolvedValue({ ok: false, reason: "moderation" });
  vi.mocked(createSoothe).mockReset().mockResolvedValue({ ok: false, reason: "moderation" });
  vi.mocked(evaluateText).mockReset().mockResolvedValue({ months: 14, axis: "赤ちゃん度", label: "1歳2か月" });
  vi.mocked(transformText).mockReset().mockResolvedValue({ action: "allow", transformedText: "つかれたでちゅ" });
});

describe("composer behavior after component extraction", () => {
  it("allows typing beyond 150 characters but prevents submission", () => {
    renderComposer();
    const send = screen.getByRole<HTMLButtonElement>("button", { name: "バブる" });
    expect(send.disabled).toBe(true);
    typeBody("あ".repeat(150));
    expect(send.disabled).toBe(false);
    typeBody("あ".repeat(151));
    expect(screen.getByRole<HTMLTextAreaElement>("textbox").value).toHaveLength(151);
    expect(send.disabled).toBe(true);
  });

  it("inserts a stamp at the selection and counts it as one character", () => {
    renderComposer();
    typeBody("あ".repeat(149));
    const field = screen.getByRole<HTMLTextAreaElement>("textbox");
    field.setSelectionRange(1, 1);
    fireEvent.click(screen.getByRole("button", { name: "スタンプ" }));
    fireEvent.click(screen.getByRole("button", { name: "ないちゃう を 本文に 入れる" }));
    expect(field.value).toBe("あ:naku:" + "あ".repeat(148));
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "ないちゃう を 本文に 入れる" }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "バブる" }).disabled).toBe(false);
    expect(screen.getByText("こう 出ます")).toBeTruthy();
  });

  it("renders evaluation results and invalidates them when the body changes", async () => {
    renderComposer();
    typeBody("つかれた");
    fireEvent.click(screen.getByRole("button", { name: "赤ちゃん度" }));
    expect(await screen.findByText("1歳2か月")).toBeTruthy();
    expect(evaluateText).toHaveBeenCalledWith("つかれた", "baby");
    typeBody("ねむい");
    expect(screen.queryByText("1歳2か月")).toBeNull();
  });

  it("puts transformed text into the editor without submitting", async () => {
    renderComposer();
    typeBody("つかれた");
    fireEvent.click(screen.getByRole("button", { name: "変換" }));
    fireEvent.click(await screen.findByRole("button", { name: "これで書く" }));
    expect(screen.getByRole<HTMLTextAreaElement>("textbox").value).toBe("つかれたでちゅ");
    expect(createBubble).not.toHaveBeenCalled();
    expect(createSoothe).not.toHaveBeenCalled();
  });

  it.each([
    [false, true, true],
    [true, false, false],
  ])("keeps evaluation (%s) and generation (%s) availability independent", (evaluation, generation, disabled) => {
    renderComposer({ kind: "bubble" }, evaluation, generation);
    typeBody("つかれた");
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "バブる" }).disabled).toBe(disabled);
  });

  it("retains the draft and displays moderation rejection", async () => {
    renderComposer();
    typeBody("下書き");
    fireEvent.click(screen.getByRole("button", { name: "バブる" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(createBubble).toHaveBeenCalledWith({ body: "下書き" });
    expect(screen.getByRole<HTMLTextAreaElement>("textbox").value).toBe("下書き");
  });

  it("replies to a mother's soothe only as a baby and preserves the reply target", async () => {
    renderComposer({ kind: "reply", target: {
      kind: "soothe", bubbleId: "bubble-1", sootheId: "soothe-1",
      authorKind: "mother", authorNickname: "返信先", bubbleIsMine: false,
    } });
    expect(screen.queryByRole("button", { name: /お母さんに変更/ })).toBeNull();
    typeBody("おへんじ");
    fireEvent.click(screen.getByRole("button", { name: "バブる" }));
    await waitFor(() => expect(createSoothe).toHaveBeenCalledWith({
      bubbleId: "bubble-1", replyToSootheId: "soothe-1", personaKind: "baby", body: "おへんじ",
    }));
  });
});
