// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentChunk } from "../../../lib/types";
import { MessageList } from "../MessageList";

describe("MessageList", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("renders completion chunks as assistant messages", () => {
    const chunks: AgentChunk[] = [
      {
        id: "completion-1",
        type: "completion",
        result: "The final result is visible.",
        created_at: "2026-05-11T00:00:00.000Z",
      },
    ];

    render(<MessageList chunks={chunks} />);

    expect(screen.getByText("The final result is visible.")).toBeVisible();
  });

  it("renders attempt_completion result text", () => {
    const chunks: AgentChunk[] = [
      {
        id: "attempt-completion-1",
        type: "attempt_completion",
        result: "Final answer from the agent.",
        created_at: "2026-05-11T00:00:00.000Z",
      },
    ];

    render(<MessageList chunks={chunks} />);

    expect(screen.getByText("Final answer from the agent.")).toBeVisible();
  });

  it("copies a user message from the context menu", async () => {
    const chunks: AgentChunk[] = [
      {
        id: "user-1",
        type: "user",
        text: "右クリックでコピーしたいメッセージ",
        created_at: "2026-05-11T00:00:00.000Z",
      },
    ];

    render(<MessageList chunks={chunks} />);

    fireEvent.contextMenu(
      screen.getByText("右クリックでコピーしたいメッセージ"),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "すべてコピー" }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "右クリックでコピーしたいメッセージ",
      );
    });
  });
});
