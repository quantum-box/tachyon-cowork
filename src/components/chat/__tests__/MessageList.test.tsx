// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AgentChunk } from "../../../lib/types";
import { MessageList } from "../MessageList";

describe("MessageList", () => {
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
});
