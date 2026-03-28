import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { loadAuth, saveAuth, clearAuth, buildAuthState } from "../auth";

// Helper: create a minimal JWT with given payload
function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.fakesignature`;
}

function validToken(expiresInSec = 3600): string {
  return makeJwt({ sub: "user1", exp: Math.floor(Date.now() / 1000) + expiresInSec });
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
      apiBaseUrl: "https://api.example.com",
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
      apiBaseUrl: "https://api.example.com",
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
      apiBaseUrl: "https://api.example.com",
      tenantId: "",
    });
    expect(loadAuth()).toBeNull();
  });

  it("returns null for expired token without refresh token", () => {
    saveAuth({
      accessToken: expiredToken(),
      apiBaseUrl: "https://api.example.com",
      tenantId: "tn_test",
    });
    expect(loadAuth()).toBeNull();
  });

  it("returns auth for expired token WITH refresh token (TokenManager will refresh)", () => {
    saveAuth({
      accessToken: expiredToken(),
      apiBaseUrl: "https://api.example.com",
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
      apiBaseUrl: "https://api.example.com",
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
      apiBaseUrl: "https://api.example.com",
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
      apiBaseUrl: "https://api.example.com",
      accessToken: makeJwt({ exp }),
      tenantId: "tn_test",
    });
    expect(auth.expiresAt).toBe(exp * 1000);
  });

  it("sets expiresAt to undefined for non-JWT tokens", () => {
    const auth = buildAuthState({
      apiBaseUrl: "https://api.example.com",
      accessToken: "opaque-token",
      tenantId: "tn_test",
    });
    expect(auth.expiresAt).toBeUndefined();
  });
});
