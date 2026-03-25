import { getTokenExpiresAt, isTokenExpired } from "./jwt";

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

export function loadAuth(): AuthState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as AuthState;

    // Validate required fields — incomplete auth must not bypass login
    if (!state.accessToken || !state.apiBaseUrl || !state.tenantId) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    // If the access token is expired and there's no refresh token,
    // clear stale auth so the login screen is shown.
    if (isTokenExpired(state.accessToken) && !state.refreshToken) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return state;
  } catch {
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
