import { getTokenExpiresAt } from "./jwt";

const STORAGE_KEY = "tachyon-cowork-auth";
const PLACEHOLDER_HOSTS = new Set(["example.com", "api.example.com"]);
const PLACEHOLDER_VALUES = new Set([
  "dev-token",
  "dev-tenant",
  "dev-user",
  "fake",
  "test",
]);
export const DEFAULT_API_BASE_URL = "https://api.n1.tachy.one";

export type AuthState = {
  accessToken: string;
  tenantId: string;
  apiBaseUrl: string;
  userId?: string;
  refreshToken?: string;
  /** ms since epoch — derived from JWT exp or calculated from expires_in */
  expiresAt?: number;
  clientId?: string;
  clientSecret?: string;
};

export function isPlaceholderAuthState(
  value: Partial<AuthState> | null | undefined,
): boolean {
  if (!value) return false;

  if (
    (value.accessToken && PLACEHOLDER_VALUES.has(value.accessToken)) ||
    (value.tenantId && PLACEHOLDER_VALUES.has(value.tenantId)) ||
    (value.userId && PLACEHOLDER_VALUES.has(value.userId))
  ) {
    return true;
  }

  if (!value.apiBaseUrl) return false;

  try {
    const host = new URL(value.apiBaseUrl).hostname;
    return PLACEHOLDER_HOSTS.has(host);
  } catch {
    return false;
  }
}

export function normalizeApiBaseUrl(apiBaseUrl: string): string {
  const trimmed = apiBaseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) return trimmed;

  if (trimmed === "/api/v1") {
    return "/api";
  }

  try {
    const url = new URL(trimmed);
    if (
      url.hostname === "api.n1.tachy.one" &&
      (url.pathname === "/v1" || url.pathname === "/v1/")
    ) {
      url.pathname = "";
      return url.toString().replace(/\/+$/, "");
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

function isValidStoredAuth(value: unknown): value is AuthState {
  if (!value || typeof value !== "object") return false;

  const auth = value as Partial<AuthState>;
  return (
    typeof auth.accessToken === "string" &&
    auth.accessToken.length > 0 &&
    typeof auth.tenantId === "string" &&
    auth.tenantId.length > 0 &&
    typeof auth.apiBaseUrl === "string" &&
    auth.apiBaseUrl.length > 0
  );
}

export function loadAuth(): AuthState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    if (!isValidStoredAuth(parsed)) {
      clearAuth();
      return null;
    }

    if (isPlaceholderAuthState(parsed)) {
      clearAuth();
      return null;
    }

    const expiresAt =
      parsed.expiresAt ?? getTokenExpiresAt(parsed.accessToken) ?? undefined;
    if (expiresAt && expiresAt <= Date.now() && !parsed.refreshToken) {
      clearAuth();
      return null;
    }

    const normalizedApiBaseUrl = normalizeApiBaseUrl(parsed.apiBaseUrl);
    if (normalizedApiBaseUrl !== parsed.apiBaseUrl) {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ...parsed,
          apiBaseUrl: normalizedApiBaseUrl,
        }),
      );
    }

    return {
      ...parsed,
      apiBaseUrl: normalizedApiBaseUrl,
      expiresAt,
    };
  } catch {
    clearAuth();
    return null;
  }
}

export function saveAuth(state: AuthState): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...state,
      apiBaseUrl: normalizeApiBaseUrl(state.apiBaseUrl),
    }),
  );
}

export function clearAuth(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Build an AuthState from login inputs, auto-detecting expiresAt from the JWT.
 */
export function buildAuthState(params: {
  apiBaseUrl: string;
  accessToken: string;
  tenantId: string;
  userId?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
}): AuthState {
  const expiresAt = getTokenExpiresAt(params.accessToken) ?? undefined;
  return {
    ...params,
    apiBaseUrl: normalizeApiBaseUrl(params.apiBaseUrl),
    expiresAt,
  };
}
