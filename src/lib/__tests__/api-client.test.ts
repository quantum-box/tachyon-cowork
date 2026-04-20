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
        new Response('{"error":"No pending tool call found for the given tool_id"}', {
          status: 404,
          statusText: "Not Found",
        }),
      )
      .mockResolvedValueOnce(
        new Response('{"error":"No pending tool call found for the given tool_id"}', {
          status: 404,
          statusText: "Not Found",
        }),
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
    await expect(promise).resolves.toBeUndefined();
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
