import type { TokenManager } from "./token-manager";

export type FetchWithAuthOptions = RequestInit & {
  tokenManager?: TokenManager;
  isSSE?: boolean;
};

export async function fetchWithAuth(
  url: string,
  options: FetchWithAuthOptions,
): Promise<Response> {
  const { tokenManager, isSSE, ...init } = options;
  void isSSE;

  const response = await fetch(url, init);
  if (response.status === 401 && tokenManager) {
    const freshToken = await tokenManager.forceRefreshToken();
    const retryHeaders = new Headers(init.headers);
    retryHeaders.set("Authorization", `Bearer ${freshToken}`);

    const retryResponse = await fetch(url, { ...init, headers: retryHeaders });
    if (retryResponse.status === 401) {
      tokenManager.handleUnauthorizedError();
    }
    return retryResponse;
  }

  return response;
}
