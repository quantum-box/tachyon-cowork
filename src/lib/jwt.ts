/**
 * Minimal JWT payload decoder (no verification — that's the server's job).
 * We only need the `exp` claim to schedule proactive token refresh.
 */

type JwtPayload = {
  exp?: number;
  iat?: number;
  sub?: string;
  aud?: string;
  tenant_id?: string;
  scope?: string;
  [key: string]: unknown;
};

/** Decode the payload section of a JWT without verifying the signature. */
export function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    // base64url → base64 → decode
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(base64);
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

/** Returns the expiry time (ms since epoch) from a JWT, or null if unparseable. */
export function getTokenExpiresAt(token: string): number | null {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return null;
  return payload.exp * 1000; // seconds → milliseconds
}

/** Returns true if the token expires within `marginMs` milliseconds. */
export function isTokenExpiringSoon(
  token: string,
  marginMs: number = 5 * 60 * 1000,
): boolean {
  const expiresAt = getTokenExpiresAt(token);
  if (expiresAt === null) return false; // Can't determine — assume valid
  return Date.now() + marginMs >= expiresAt;
}

/** Returns true if the token is already expired. */
export function isTokenExpired(token: string): boolean {
  return isTokenExpiringSoon(token, 0);
}
