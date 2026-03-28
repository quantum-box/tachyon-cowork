const PKCE_VERIFIER_KEY = "tachyon-cowork-oauth-pkce-verifier";
const OAUTH_STATE_KEY = "tachyon-cowork-oauth-state";

type OAuthLoginParams = {
  domain: string;
  clientId: string;
  redirectUri: string;
  scopes: string;
};

type OAuthTokenExchangeParams = {
  domain: string;
  clientId: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
};

export type OAuthCallbackParams = {
  code: string | null;
  state: string | null;
  error: string | null;
  errorDescription: string | null;
};

export type OAuthTokenResponse = {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresIn?: number;
};

function encodeBase64Url(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomString(byteLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return encodeBase64Url(bytes);
}

async function sha256(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return encodeBase64Url(new Uint8Array(digest));
}

export async function buildOAuthLoginUrl({
  domain,
  clientId,
  redirectUri,
  scopes,
}: OAuthLoginParams): Promise<string> {
  const codeVerifier = randomString(64);
  const state = randomString(32);
  const codeChallenge = await sha256(codeVerifier);

  sessionStorage.setItem(PKCE_VERIFIER_KEY, codeVerifier);
  sessionStorage.setItem(OAUTH_STATE_KEY, state);

  const search = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: scopes,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
    state,
  });

  return `${domain.replace(/\/+$/, "")}/login?${search.toString()}`;
}

export function parseOAuthCallback(rawUrl: string): OAuthCallbackParams | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  return {
    code: url.searchParams.get("code"),
    state: url.searchParams.get("state"),
    error: url.searchParams.get("error"),
    errorDescription: url.searchParams.get("error_description"),
  };
}

export function consumeOAuthVerifier(expectedState: string | null): string | null {
  const state = sessionStorage.getItem(OAUTH_STATE_KEY);
  const codeVerifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);

  sessionStorage.removeItem(OAUTH_STATE_KEY);
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);

  if (!state || !codeVerifier || !expectedState || state !== expectedState) {
    return null;
  }

  return codeVerifier;
}

export function clearPendingOAuthState(): void {
  sessionStorage.removeItem(OAUTH_STATE_KEY);
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
}

export async function exchangeAuthorizationCode({
  domain,
  clientId,
  redirectUri,
  code,
  codeVerifier,
}: OAuthTokenExchangeParams): Promise<OAuthTokenResponse> {
  const response = await fetch(`${domain.replace(/\/+$/, "")}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `認証コードの交換に失敗しました: ${response.status}${body ? ` - ${body}` : ""}`,
    );
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    expires_in?: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    idToken: data.id_token,
    expiresIn: data.expires_in,
  };
}
