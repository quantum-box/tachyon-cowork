import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentChatClient } from "../../lib/api-client";
import type { AgentChunk } from "../../lib/types";
import { executeClientTool } from "../../lib/tauri-bridge";
import { useAgentChat } from "../useAgentChat";

type ToolResultResponse = AgentChunk | AgentChunk[] | Response;

vi.mock("../../lib/tauri-bridge", () => ({
  executeClientTool: vi.fn(),
  isTauri: vi.fn(() => true),
}));

function buildRawSseResponse(events: string[]): Response {
  const encoder = new TextEncoder();
  const payload = `${events.join("")}data: [DONE]\n\n`;
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(payload));
        controller.close();
      },
    }),
  );
}

function buildSseResponse(chunks: AgentChunk[]): Response {
  return buildRawSseResponse(
    chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`),
  );
}

function buildClient(
  chunks: AgentChunk[],
  toolResultChunks: ToolResultResponse[] = [],
): AgentChatClient {
  const toolResultResponses = toolResultChunks.map((response) =>
    response instanceof Response
      ? response
      : buildSseResponse(Array.isArray(response) ? response : [response]),
  );
  return {
    getSessions: vi.fn().mockResolvedValue([]),
    createSession: vi.fn().mockResolvedValue({
      session: { id: "session-1", name: "List workspace" },
    }),
    executeAgent: vi.fn().mockResolvedValue(buildSseResponse(chunks)),
    submitToolResult: vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(toolResultResponses.shift() ?? buildSseResponse([])),
      ),
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

  it("passes the configured max requests to agent execution", async () => {
    const client = buildClient([]);

    const { result } = renderHook(() =>
      useAgentChat(
        client,
        undefined,
        undefined,
        undefined,
        "",
        undefined,
        undefined,
        42,
      ),
    );

    await act(async () => {
      await result.current.sendMessage("Use more loops");
    });

    expect(client.executeAgent).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        max_requests: 42,
      }),
    );
  });

  it("uses an explicit model override when sending a message", async () => {
    const client = buildClient([]);

    const { result } = renderHook(() => useAgentChat(client));

    await act(async () => {
      await result.current.sendMessage(
        "Use selected realtime handoff model",
        undefined,
        undefined,
        "openai/gpt-5.4",
      );
    });

    expect(client.executeAgent).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        model: "openai/gpt-5.4",
      }),
    );
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

  it("continues consuming agent chunks returned by tool-result submission", async () => {
    vi.mocked(executeClientTool).mockResolvedValue({
      tool_id: "tool-1",
      result: { entries: ["dist", "docs", "node_modules"] },
    });
    const client = buildClient([toolCallChunk], [
      {
        id: "chunk-say-1",
        type: "say",
        text: "Listed the workspace root.",
        created_at: "2026-04-20T00:00:01.000Z",
      },
    ]);

    const { result } = renderHook(() => useAgentChat(client));

    await act(async () => {
      await result.current.sendMessage("List workspace root");
    });

    expect(result.current.chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "say",
          text: "Listed the workspace root.",
        }),
      ]),
    );
    expect(result.current.error).toBeNull();
  });

  it("handles chained client tool calls emitted after a tool result", async () => {
    vi.mocked(executeClientTool)
      .mockResolvedValueOnce({
        tool_id: "tool-1",
        result: { entries: ["src", "package.json"] },
      })
      .mockResolvedValueOnce({
        tool_id: "tool-2",
        result: { name: "package.json", size: 2245 },
      });
    const secondToolCall: AgentChunk & { args: Record<string, unknown> } = {
      id: "chunk-tool-2",
      type: "tool_call_pending",
      tool_id: "tool-2",
      tool_name: "local_get_file_info",
      args: { path: "package.json" },
      created_at: "2026-04-20T00:00:01.000Z",
    };
    const client = buildClient([toolCallChunk], [
      secondToolCall,
      {
        id: "chunk-say-2",
        type: "say",
        text: "Both tools completed.",
        created_at: "2026-04-20T00:00:02.000Z",
      },
    ]);

    const { result } = renderHook(() => useAgentChat(client));

    await act(async () => {
      await result.current.sendMessage("Inspect workspace and package file");
    });

    expect(executeClientTool).toHaveBeenNthCalledWith(1, {
      name: "host_list_dir",
      arguments: { path: "." },
    });
    expect(executeClientTool).toHaveBeenNthCalledWith(2, {
      name: "local_get_file_info",
      arguments: { path: "package.json" },
    });
    expect(client.submitToolResult).toHaveBeenCalledTimes(2);
    expect(result.current.chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "say",
          text: "Both tools completed.",
        }),
      ]),
    );
    expect(result.current.error).toBeNull();
  });

  it("does not fail when tool-result returns a successful empty response", async () => {
    vi.mocked(executeClientTool).mockResolvedValue({
      tool_id: "tool-1",
      result: { ok: true },
    });
    const client = buildClient([toolCallChunk], [
      new Response(null, { status: 204 }),
    ]);

    const { result } = renderHook(() => useAgentChat(client));

    await act(async () => {
      await result.current.sendMessage("List workspace root");
    });

    expect(client.submitToolResult).toHaveBeenCalledTimes(1);
    expect(result.current.chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "tool_call",
          tool_id: "tool-1",
          is_finished: true,
        }),
      ]),
    );
    expect(result.current.error).toBeNull();
  });

  it("surfaces error chunks emitted by the tool-result continuation stream", async () => {
    vi.mocked(executeClientTool).mockResolvedValue({
      tool_id: "tool-1",
      result: { ok: true },
    });
    const client = buildClient([toolCallChunk], [
      buildRawSseResponse([
        `data: ${JSON.stringify({ error: { message: "Agent execute failed after tool result" } })}\n\n`,
      ]),
    ]);

    const { result } = renderHook(() => useAgentChat(client));

    await act(async () => {
      await result.current.sendMessage("List workspace root");
    });

    expect(result.current.error).toEqual(
      expect.objectContaining({
        kind: "server",
        message: "Agent API が応答できませんでした。少し待ってから再試行してください。",
      }),
    );
  });

  it("surfaces typed SSE error events as chat errors", async () => {
    const client = buildClient([]);
    vi.mocked(client.executeAgent).mockResolvedValueOnce(
      buildRawSseResponse([
        `event: error\ndata: ${JSON.stringify({
          code: "EXECUTION_ERROR",
          message:
            "Failed to start agent execution: BadRequest: Model is unavailable.",
          type: "error",
        })}\n\n`,
      ]),
    );

    const { result } = renderHook(() => useAgentChat(client));

    await act(async () => {
      await result.current.sendMessage("Send from realtime");
    });

    expect(result.current.error).toEqual(
      expect.objectContaining({
        kind: "server",
        message:
          "Failed to start agent execution: BadRequest: Model is unavailable.",
      }),
    );
    expect(result.current.chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "error",
          text: "Failed to start agent execution: BadRequest: Model is unavailable.",
          code: "EXECUTION_ERROR",
        }),
      ]),
    );
  });

  it("skips malformed continuation events and keeps consuming valid chunks", async () => {
    vi.mocked(executeClientTool).mockResolvedValue({
      tool_id: "tool-1",
      result: { ok: true },
    });
    const client = buildClient([toolCallChunk], [
      buildRawSseResponse([
        "data: {not-json}\n\n",
        `data: ${JSON.stringify({
          id: "chunk-say-valid",
          type: "say",
          text: "Recovered after malformed event.",
          created_at: "2026-04-20T00:00:03.000Z",
        })}\n\n`,
      ]),
    ]);

    const { result } = renderHook(() => useAgentChat(client));

    await act(async () => {
      await result.current.sendMessage("List workspace root");
    });

    expect(result.current.chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "say",
          text: "Recovered after malformed event.",
        }),
      ]),
    );
    expect(result.current.error).toBeNull();
  });
});
