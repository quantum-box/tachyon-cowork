import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentChatClient } from "../../lib/api-client";
import type { AgentChunk } from "../../lib/types";
import { executeClientTool } from "../../lib/tauri-bridge";
import { useAgentChat } from "../useAgentChat";

vi.mock("../../lib/tauri-bridge", () => ({
  executeClientTool: vi.fn(),
  isTauri: vi.fn(() => true),
}));

function buildSseResponse(chunks: AgentChunk[]): Response {
  const encoder = new TextEncoder();
  const payload =
    chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") +
    "data: [DONE]\n\n";

  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(payload));
        controller.close();
      },
    }),
  );
}

function buildClient(chunks: AgentChunk[]): AgentChatClient {
  return {
    getSessions: vi.fn().mockResolvedValue([]),
    createSession: vi.fn().mockResolvedValue({
      session: { id: "session-1", name: "List workspace" },
    }),
    executeAgent: vi.fn().mockResolvedValue(buildSseResponse(chunks)),
    submitToolResult: vi.fn().mockResolvedValue({}),
    getMessages: vi.fn().mockResolvedValue([]),
    deleteMessage: vi.fn().mockResolvedValue({}),
    deleteSession: vi.fn().mockResolvedValue({}),
  } as unknown as AgentChatClient;
}

const toolCallChunk: AgentChunk & { args: Record<string, unknown> } = {
  id: "chunk-tool-1",
  type: "tool_call_pending",
  tool_id: "tool-1",
  tool_name: "host_list_dir",
  args: { path: "." },
  created_at: "2026-04-20T00:00:00.000Z",
};

describe("useAgentChat tool flow", () => {
  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("executes a streamed client tool call and submits the tool result", async () => {
    vi.mocked(executeClientTool).mockResolvedValue({
      tool_id: "tool-1",
      result: { entries: ["dist", "docs", "node_modules"] },
    });
    const client = buildClient([toolCallChunk]);

    const { result } = renderHook(() => useAgentChat(client));

    await act(async () => {
      await result.current.sendMessage("List workspace root");
    });

    expect(executeClientTool).toHaveBeenCalledWith({
      name: "host_list_dir",
      arguments: { path: "." },
    });
    expect(client.submitToolResult).toHaveBeenCalledWith("session-1", {
      tool_id: "tool-1",
      result: expect.stringContaining("node_modules"),
      is_finished: true,
    });
    expect(result.current.error).toBeNull();
  });

  it("does not submit duplicate tool results for the same streamed tool id", async () => {
    vi.mocked(executeClientTool).mockResolvedValue({
      tool_id: "tool-1",
      result: { entries: ["dist", "docs", "node_modules"] },
    });
    const client = buildClient([toolCallChunk, toolCallChunk]);

    const { result } = renderHook(() => useAgentChat(client));

    await act(async () => {
      await result.current.sendMessage("List workspace root");
    });

    expect(executeClientTool).toHaveBeenCalledTimes(1);
    expect(client.submitToolResult).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });
});
