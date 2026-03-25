/**
 * OAuth2 Authorization Code flow with PKCE for Tachyon Auth Platform.
 *
 * Works in both Tauri (desktop) and browser (web) environments —
 * both use the same redirect-based flow since Tauri's webview handles
 * navigation natively.
 */

const VERIFIER_STORAGE_KEY = "tachyon-cowork-pkce-verifier";

/** Generate a cryptographically random code_verifier (43-128 chars). */
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

/** Compute the S256 code_challenge from a code_verifier. */
async function computeCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(bytes: Uint8Array): string {
  const binary = Array.from(bytes)
    .map((b) => String.fromCharCode(b))
    .join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export type OAuth2Config = {
  domain: string;
  clientId: string;
  redirectUri: string;
  scopes: string;
};

export function getOAuth2Config(): OAuth2Config {
  return {
    domain: import.meta.env.VITE_COGNITO_DOMAIN ?? "",
    clientId: import.meta.env.VITE_COGNITO_CLIENT_ID ?? "",
    redirectUri: import.meta.env.VITE_COGNITO_REDIRECT_URI ?? "",
    scopes: import.meta.env.VITE_COGNITO_SCOPES ?? "openid email profile",
  };
}

/** Redirect the user to the authorization endpoint with PKCE. */
export async function startOAuth2Login(): Promise<void> {
  const config = getOAuth2Config();
  const verifier = generateCodeVerifier();
  const challenge = await computeCodeChallenge(verifier);

  // Store verifier so the callback can use it
  sessionStorage.setItem(VERIFIER_STORAGE_KEY, verifier);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: config.scopes,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  window.location.href = `${config.domain}/oauth2/authorize?${params.toString()}`;
}

export type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  token_type: string;
};

/**
 * Exchange an authorization code for tokens using the stored PKCE verifier.
 */
export async function exchangeCodeForTokens(
  code: string,
): Promise<TokenResponse> {
  const config = getOAuth2Config();
  const verifier = sessionStorage.getItem(VERIFIER_STORAGE_KEY);
  if (!verifier) {
    throw new Error("No PKCE code_verifier found — login flow was not started properly");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.clientId,
    code,
    redirect_uri: config.redirectUri,
    code_verifier: verifier,
  });

  const res = await fetch(`${config.domain}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  // Clean up verifier regardless of outcome
  sessionStorage.removeItem(VERIFIER_STORAGE_KEY);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }

  return (await res.json()) as TokenResponse;
}

/** Check if the current URL is a callback with an authorization code. */
export function getCallbackCode(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("code");
}

/** Check if the current URL has an OAuth2 error. */
export function getCallbackError(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("error_description") ?? params.get("error");
}
