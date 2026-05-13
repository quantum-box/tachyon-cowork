import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentChatClient, ApiRequestError } from "../api-client";

const authConfig = {
  apiBaseUrl: "https://api.test.local",
  accessToken: "token",
  tenantId: "tenant",
};

describe("AgentChatClient.submitToolResult", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("retries transient pending-tool 404 responses and eventually succeeds", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          '{"error":"No pending tool call found for the given tool_id"}',
          {
            status: 404,
            statusText: "Not Found",
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          '{"error":"No pending tool call found for the given tool_id"}',
          {
            status: 404,
            statusText: "Not Found",
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response("", {
          status: 200,
          statusText: "OK",
        }),
      );

    const client = new AgentChatClient(authConfig);
    const promise = client.submitToolResult("session-1", {
      tool_id: "tool-1",
      result: "{}",
      is_finished: true,
    });

    await vi.runAllTimersAsync();
    await expect(promise).resolves.toMatchObject({ ok: true, status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("throws immediately for unrelated 404 responses", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response('{"error":"some other 404"}', {
        status: 404,
        statusText: "Not Found",
      }),
    );

    const client = new AgentChatClient(authConfig);
    await expect(
      client.submitToolResult("session-1", {
        tool_id: "tool-1",
        result: "{}",
        is_finished: true,
      }),
    ).rejects.toBeInstanceOf(ApiRequestError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("AgentChatClient.issueRealtimeClientSecret", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("requests a backend-issued realtime client secret with Tachyon auth headers", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          client_secret: "ek_test",
          expires_at: 123,
          model: "gpt-realtime-2",
          mode: "conversation",
          voice: "marin",
        }),
        {
          status: 200,
          statusText: "OK",
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const client = new AgentChatClient(authConfig);
    await expect(
      client.issueRealtimeClientSecret({
        model: "gpt-realtime-translate",
        mode: "translate",
        instructions: "Use the available tools.",
        tool_choice: "auto",
        tools: [{ type: "function", name: "set_agent_chat_draft" }],
        vad: "server_vad_ambient",
      }),
    ).resolves.toMatchObject({
      client_secret: "ek_test",
      model: "gpt-realtime-2",
      mode: "conversation",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.test.local/v1/llms/realtime/client-secret");
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer token");
    expect(headers.get("x-operator-id")).toBe("tenant");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "gpt-realtime-translate",
      mode: "translate",
      instructions: "Use the available tools.",
      tool_choice: "auto",
      tools: [{ type: "function", name: "set_agent_chat_draft" }],
      vad: "server_vad_ambient",
    });
  });
});
