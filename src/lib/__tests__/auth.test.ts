import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  buildAuthState,
  clearAuth,
  loadAuth,
  normalizeApiBaseUrl,
  saveAuth,
} from "../auth";

const TEST_API_BASE_URL = "https://api.test.local/v1";

// Helper: create a minimal JWT with given payload
function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.fakesignature`;
}

function validToken(expiresInSec = 3600): string {
  return makeJwt({
    sub: "user1",
    exp: Math.floor(Date.now() / 1000) + expiresInSec,
  });
}

function expiredToken(): string {
  return makeJwt({ sub: "user1", exp: Math.floor(Date.now() / 1000) - 3600 });
}

describe("loadAuth", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null when nothing is stored", () => {
    expect(loadAuth()).toBeNull();
  });

  it("returns stored auth with valid token", () => {
    const auth = {
      accessToken: validToken(),
      apiBaseUrl: TEST_API_BASE_URL,
      tenantId: "tn_test",
    };
    saveAuth(auth);
    const loaded = loadAuth();
    expect(loaded).not.toBeNull();
    expect(loaded!.tenantId).toBe("tn_test");
  });

  it("returns null when accessToken is empty", () => {
    saveAuth({
      accessToken: "",
      apiBaseUrl: TEST_API_BASE_URL,
      tenantId: "tn_test",
    });
    expect(loadAuth()).toBeNull();
  });

  it("returns null when apiBaseUrl is missing", () => {
    saveAuth({
      accessToken: validToken(),
      apiBaseUrl: "",
      tenantId: "tn_test",
    });
    expect(loadAuth()).toBeNull();
  });

  it("returns null when tenantId is missing", () => {
    saveAuth({
      accessToken: validToken(),
      apiBaseUrl: TEST_API_BASE_URL,
      tenantId: "",
    });
    expect(loadAuth()).toBeNull();
  });

  it("returns null for expired token without refresh token", () => {
    saveAuth({
      accessToken: expiredToken(),
      apiBaseUrl: TEST_API_BASE_URL,
      tenantId: "tn_test",
    });
    expect(loadAuth()).toBeNull();
  });

  it("returns auth for expired token WITH refresh token (TokenManager will refresh)", () => {
    saveAuth({
      accessToken: expiredToken(),
      apiBaseUrl: TEST_API_BASE_URL,
      tenantId: "tn_test",
      refreshToken: "refresh_xxx",
    });
    const loaded = loadAuth();
    expect(loaded).not.toBeNull();
    expect(loaded!.refreshToken).toBe("refresh_xxx");
  });

  it("clears localStorage when returning null for invalid auth", () => {
    saveAuth({
      accessToken: "",
      apiBaseUrl: TEST_API_BASE_URL,
      tenantId: "tn_test",
    });
    loadAuth();
    expect(localStorage.getItem("tachyon-cowork-auth")).toBeNull();
  });

  it("returns null for corrupted JSON", () => {
    localStorage.setItem("tachyon-cowork-auth", "not-json");
    expect(loadAuth()).toBeNull();
  });
});

describe("clearAuth", () => {
  it("removes auth from localStorage", () => {
    saveAuth({
      accessToken: validToken(),
      apiBaseUrl: TEST_API_BASE_URL,
      tenantId: "tn_test",
    });
    clearAuth();
    expect(loadAuth()).toBeNull();
  });
});

describe("buildAuthState", () => {
  it("auto-detects expiresAt from JWT", () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const auth = buildAuthState({
      apiBaseUrl: TEST_API_BASE_URL,
      accessToken: makeJwt({ exp }),
      tenantId: "tn_test",
    });
    expect(auth.expiresAt).toBe(exp * 1000);
  });

  it("sets expiresAt to undefined for non-JWT tokens", () => {
    const auth = buildAuthState({
      apiBaseUrl: TEST_API_BASE_URL,
      accessToken: "opaque-token",
      tenantId: "tn_test",
    });
    expect(auth.expiresAt).toBeUndefined();
  });

  it("clears placeholder auth state", () => {
    saveAuth({
      accessToken: "dev-token",
      apiBaseUrl: "https://api.example.com",
      tenantId: "dev-tenant",
    });

    expect(loadAuth()).toBeNull();
    expect(localStorage.getItem("tachyon-cowork-auth")).toBeNull();
  });

  it("clears obvious fake manual auth state", () => {
    saveAuth({
      accessToken: "fake",
      apiBaseUrl: "http://localhost:9999",
      tenantId: "test",
      userId: "test",
    });

    expect(loadAuth()).toBeNull();
    expect(localStorage.getItem("tachyon-cowork-auth")).toBeNull();
  });

  it("normalizes the production API base URL", () => {
    const auth = buildAuthState({
      apiBaseUrl: "https://api.n1.tachy.one/v1",
      accessToken: "opaque-token",
      tenantId: "tn_test",
    });

    expect(auth.apiBaseUrl).toBe("https://api.n1.tachy.one");
  });
});

describe("normalizeApiBaseUrl", () => {
  it("rewrites the production /v1 path to the root API URL", () => {
    expect(normalizeApiBaseUrl("https://api.n1.tachy.one/v1")).toBe(
      "https://api.n1.tachy.one",
    );
  });

  it("rewrites the dev proxy /api/v1 path to /api", () => {
    expect(normalizeApiBaseUrl("/api/v1")).toBe("/api");
  });
});
