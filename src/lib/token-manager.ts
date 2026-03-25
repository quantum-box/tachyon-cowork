import { type AuthState, saveAuth } from "./auth";
import { getTokenExpiresAt, isTokenExpiringSoon } from "./jwt";
import { getOAuth2Config } from "./oauth2";

/** How early (ms) before expiry we attempt a proactive refresh. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000; // 5 minutes

/** Minimum interval between refresh attempts to avoid hammering. */
const MIN_RETRY_INTERVAL_MS = 30 * 1000; // 30 seconds

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type: string;
  scope?: string;
};

export type TokenManagerCallbacks = {
  /** Called when the auth state is updated with new tokens. */
  onTokenRefreshed: (auth: AuthState) => void;
  /** Called when refresh fails irrecoverably — app should redirect to login. */
  onAuthError: () => void;
};

/**
 * Manages automatic access-token refresh using an OAuth2 refresh_token.
 *
 * - Schedules a background refresh before the token expires.
 * - Provides `ensureFreshToken()` for on-demand freshness checks.
 * - Handles token rotation (new refresh_token replaces the old one).
 */
export class TokenManager {
  private auth: AuthState;
  private callbacks: TokenManagerCallbacks;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private refreshPromise: Promise<AuthState> | null = null;
  private lastRefreshAttempt = 0;

  constructor(auth: AuthState, callbacks: TokenManagerCallbacks) {
    this.auth = auth;
    this.callbacks = callbacks;
    this.scheduleRefresh();
  }

  /** Update the auth state (e.g. after external login). */
  updateAuth(auth: AuthState): void {
    this.auth = auth;
    this.refreshPromise = null;
    this.scheduleRefresh();
  }

  /** Returns the current access token, refreshing first if needed. */
  async ensureFreshToken(): Promise<string> {
    // No refresh token → can't refresh, return what we have
    if (!this.auth.refreshToken) {
      return this.auth.accessToken;
    }

    // Already expired or expiring soon → refresh now
    if (isTokenExpiringSoon(this.auth.accessToken, REFRESH_MARGIN_MS)) {
      const newAuth = await this.refresh();
      return newAuth.accessToken;
    }

    return this.auth.accessToken;
  }

  /** Get current auth state. */
  getAuth(): AuthState {
    return this.auth;
  }

  /** Stop background refresh timer. */
  dispose(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  // ── Internal ──────────────────────────────────────────────────────

  private scheduleRefresh(): void {
    this.dispose();

    if (!this.auth.refreshToken) return;

    const expiresAt =
      this.auth.expiresAt ?? getTokenExpiresAt(this.auth.accessToken);
    if (!expiresAt) return;

    // Schedule refresh REFRESH_MARGIN_MS before expiry
    const delay = Math.max(expiresAt - Date.now() - REFRESH_MARGIN_MS, 0);

    this.timerId = setTimeout(() => {
      this.refresh().catch(() => {
        // onAuthError is called inside refresh() on failure
      });
    }, delay);
  }

  /**
   * Perform the actual token refresh. Deduplicates concurrent calls.
   */
  private async refresh(): Promise<AuthState> {
    // Deduplicate: if a refresh is already in flight, reuse it
    if (this.refreshPromise) return this.refreshPromise;

    // Rate-limit retries
    const now = Date.now();
    if (now - this.lastRefreshAttempt < MIN_RETRY_INTERVAL_MS) {
      return this.auth;
    }
    this.lastRefreshAttempt = now;

    this.refreshPromise = this.doRefresh();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async doRefresh(): Promise<AuthState> {
    const { apiBaseUrl, refreshToken, clientId, clientSecret } = this.auth;

    if (!refreshToken) {
      this.callbacks.onAuthError();
      throw new Error("No refresh token available");
    }

    const body: Record<string, string> = {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    };
    if (clientId) body.client_id = clientId;
    if (clientSecret) body.client_secret = clientSecret;

    // Use Cognito domain for token refresh (not the API base URL)
    const oauthConfig = getOAuth2Config();
    const tokenHost = oauthConfig.domain
      ? oauthConfig.domain.replace(/\/+$/, "")
      : apiBaseUrl.replace(/\/+$/, "");
    const tokenUrl = `${tokenHost}/oauth2/token`;

    try {
      const res = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(body),
      });

      if (!res.ok) {
        // 400/401 from the token endpoint means the refresh token is invalid/revoked
        if (res.status === 400 || res.status === 401) {
          this.callbacks.onAuthError();
          throw new Error("Refresh token rejected — re-login required");
        }
        throw new Error(`Token refresh failed: ${res.status}`);
      }

      const data = (await res.json()) as TokenResponse;

      const expiresAt = data.expires_in
        ? Date.now() + data.expires_in * 1000
        : getTokenExpiresAt(data.access_token) ?? undefined;

      const newAuth: AuthState = {
        ...this.auth,
        accessToken: data.access_token,
        // Token rotation: server may issue a new refresh token
        refreshToken: data.refresh_token ?? this.auth.refreshToken,
        expiresAt,
      };

      this.auth = newAuth;
      saveAuth(newAuth);
      this.callbacks.onTokenRefreshed(newAuth);
      this.scheduleRefresh();

      return newAuth;
    } catch (e) {
      // Network errors → don't force re-login, just let the token expire
      if (e instanceof TypeError && e.message.includes("fetch")) {
        console.warn("Token refresh network error — will retry", e);
        // Re-schedule a retry
        this.scheduleRefresh();
        return this.auth;
      }
      throw e;
    }
  }
}
