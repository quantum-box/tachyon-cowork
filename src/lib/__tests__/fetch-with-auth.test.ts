import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithAuth } from "../fetch-with-auth";
import type { TokenManager } from "../token-manager";

function createTokenManager(
  overrides: Partial<TokenManager> = {},
): TokenManager {
  return {
    forceRefreshToken: vi.fn().mockResolvedValue("fresh-token"),
    handleUnauthorizedError: vi.fn(),
    ...overrides,
  } as unknown as TokenManager;
}

describe("fetchWithAuth", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("refreshes the token and retries once after a 401", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const tokenManager = createTokenManager();

    const response = await fetchWithAuth("https://api.test.local/resource", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer stale-token",
      },
      body: "{}",
      tokenManager,
    });

    expect(response.status).toBe(200);
    expect(tokenManager.forceRefreshToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const retryInit = fetchMock.mock.calls[1]?.[1];
    const retryHeaders = new Headers(retryInit?.headers);
    expect(retryHeaders.get("Authorization")).toBe("Bearer fresh-token");
    expect(retryHeaders.get("Content-Type")).toBe("application/json");
    expect(tokenManager.handleUnauthorizedError).not.toHaveBeenCalled();
  });

  it("handles unauthorized when the refreshed token is also rejected", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }));
    const tokenManager = createTokenManager();

    const response = await fetchWithAuth("https://api.test.local/resource", {
      headers: { Authorization: "Bearer stale-token" },
      tokenManager,
    });

    expect(response.status).toBe(401);
    expect(tokenManager.forceRefreshToken).toHaveBeenCalledTimes(1);
    expect(tokenManager.handleUnauthorizedError).toHaveBeenCalledTimes(1);
  });
});
