import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getConfiguredApiBaseUrl,
  getConfiguredCognitoConfig,
  getConfiguredDefaultTenantId,
} from "../auth-config";

describe("auth config fallbacks", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps hosted login ready when Vite env values are absent", () => {
    vi.stubEnv("VITE_COGNITO_DOMAIN", "");
    vi.stubEnv("VITE_COGNITO_CLIENT_ID", "");
    vi.stubEnv("VITE_COGNITO_REDIRECT_URI", "");
    vi.stubEnv("VITE_COGNITO_SCOPES", "");
    vi.stubEnv("VITE_API_BASE_URL", "");
    vi.stubEnv("VITE_DEFAULT_TENANT_ID", "");

    expect(getConfiguredCognitoConfig()).toEqual({
      domain: "https://auth-pool.n1.tachy.one",
      clientId: "78a4raqiqns509aadtv7ftjmee",
      redirectUri: "http://localhost:1420/callback",
      scopes: "openid email profile",
    });
    expect(getConfiguredApiBaseUrl()).toBe("https://api.n1.tachy.one");
    expect(getConfiguredDefaultTenantId()).toBe("tn_01hjryxysgey07h5jz5wagqj0m");
  });

  it("uses the mobile deep-link redirect when provided", () => {
    expect(getConfiguredCognitoConfig("tachyon-cowork://auth/callback"))
      .toMatchObject({
        redirectUri: "tachyon-cowork://auth/callback",
      });
  });
});
