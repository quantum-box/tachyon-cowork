import { getTokenExpiresAt } from "./jwt";

const STORAGE_KEY = "tachyon-cowork-auth";

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

    const expiresAt = parsed.expiresAt ?? getTokenExpiresAt(parsed.accessToken) ?? undefined;
    if (expiresAt && expiresAt <= Date.now() && !parsed.refreshToken) {
      clearAuth();
      return null;
    }

    return {
      ...parsed,
      expiresAt,
    };
  } catch {
    clearAuth();
    return null;
  }
}

export function saveAuth(state: AuthState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
  return { ...params, expiresAt };
}
