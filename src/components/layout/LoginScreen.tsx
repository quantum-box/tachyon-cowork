import { open } from "@tauri-apps/plugin-shell";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type AuthState, buildAuthState } from "../../lib/auth";
import { decodeJwtPayload } from "../../lib/jwt";
import {
  buildOAuthLoginUrl,
  clearPendingOAuthState,
  consumeOAuthVerifier,
  exchangeAuthorizationCode,
  parseOAuthCallback,
} from "../../lib/oauth";
import { isTauri } from "../../lib/tauri-bridge";

type Props = {
  onLogin: (auth: AuthState) => void;
  oauthError?: string | null;
  isExchangingToken?: boolean;
};

type TenantOption = {
  id: string;
  name: string;
};

const TAURI_REDIRECT_URI = "tachyon-cowork://auth/callback";

function toRuntimeApiBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return trimmed;

  if (!import.meta.env.DEV) {
    return trimmed;
  }

  if (trimmed.startsWith("/")) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    return `/api${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return trimmed;
  }
}

function normalizeTenantOptions(payload: unknown): TenantOption[] {
  const candidateKeys = ["tenants", "operators", "organizations", "memberships"];
  const records =
    payload && typeof payload === "object"
      ? candidateKeys
          .map((key) => (payload as Record<string, unknown>)[key])
          .find((value) => Array.isArray(value))
      : null;

  if (!Array.isArray(records)) return [];

  return records
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const id = [
        record.id,
        record.tenant_id,
        record.tenantId,
        record.operator_id,
        record.operatorId,
        record.organization_id,
        record.organizationId,
      ].find((value): value is string => typeof value === "string" && value.length > 0);
      if (!id) return null;

      const name = [
        record.name,
        record.display_name,
        record.displayName,
        record.slug,
      ].find((value): value is string => typeof value === "string" && value.length > 0);

      return { id, name: name || id };
    })
    .filter((tenant): tenant is TenantOption => tenant !== null);
}

function extractTenantContext(
  payload: unknown,
  defaultTenantId?: string,
): { tenants: TenantOption[]; selectedTenantId?: string; userId?: string } {
  const userInfo =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};

  const tenants = normalizeTenantOptions(userInfo);
  const selectedTenantId =
    (typeof userInfo.tenant_id === "string" && userInfo.tenant_id) ||
    (typeof userInfo.tenantId === "string" && userInfo.tenantId) ||
    defaultTenantId ||
    (tenants.length === 1 ? tenants[0].id : undefined);
  const userId =
    (typeof userInfo.sub === "string" && userInfo.sub) ||
    (typeof userInfo.user_id === "string" && userInfo.user_id) ||
    (typeof userInfo.userId === "string" && userInfo.userId) ||
    undefined;

  return { tenants, selectedTenantId, userId };
}

async function fetchCognitoUserInfo(
  cognitoDomain: string,
  accessToken: string,
): Promise<unknown> {
  const response = await fetch(`${cognitoDomain.replace(/\/+$/, "")}/oauth2/userInfo`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Cognito userInfo の取得に失敗しました (${response.status} ${response.statusText})${body ? `: ${body}` : ""}`,
    );
  }

  return response.json();
}

export function LoginScreen({ onLogin, oauthError, isExchangingToken }: Props) {
  const defaultTenantId = import.meta.env.VITE_DEFAULT_TENANT_ID || "";
  const cognitoDomain = import.meta.env.VITE_COGNITO_DOMAIN || "";
  const cognitoClientId = import.meta.env.VITE_COGNITO_CLIENT_ID || "";
  const cognitoScopes = import.meta.env.VITE_COGNITO_SCOPES || "openid";
  const redirectUri = isTauri()
    ? TAURI_REDIRECT_URI
    : import.meta.env.VITE_COGNITO_REDIRECT_URI || "";
  const [apiBaseUrl, setApiBaseUrl] = useState(
    import.meta.env.VITE_API_BASE_URL || "https://api.tachyon.dev",
  );
  const [accessToken, setAccessToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [tenantOptions, setTenantOptions] = useState<TenantOption[]>([]);
  const [tenantId, setTenantId] = useState(defaultTenantId);
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const [callbackUrlInput, setCallbackUrlInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showManualLogin, setShowManualLogin] = useState(false);
  const runtimeApiBaseUrl = useMemo(() => toRuntimeApiBaseUrl(apiBaseUrl), [apiBaseUrl]);
  const isDevTauri = import.meta.env.DEV && isTauri();

  const hostedLoginReady = Boolean(cognitoDomain && cognitoClientId && redirectUri);

  const finalizeLogin = useCallback(
    (params: {
      tenantId: string;
      accessToken: string;
      refreshToken?: string;
      userId?: string;
    }) => {
      onLogin(
        buildAuthState({
          apiBaseUrl: runtimeApiBaseUrl,
          accessToken: params.accessToken,
          tenantId: params.tenantId,
          userId: params.userId,
          refreshToken: params.refreshToken || undefined,
          clientId: params.refreshToken ? cognitoClientId || undefined : undefined,
        }),
      );
    },
    [cognitoClientId, onLogin, runtimeApiBaseUrl],
  );

  const resolveTenantAndLogin = useCallback(
    async (params: {
      accessToken: string;
      refreshToken?: string;
      userId?: string;
    }) => {
      setIsLoading(true);
      setError(null);

      try {
        let userInfo: unknown;
        const res = await fetch(`${runtimeApiBaseUrl}/auth/userinfo`, {
          headers: {
            Authorization: `Bearer ${params.accessToken}`,
          },
        });

        if (res.status === 404 && cognitoDomain) {
          userInfo = await fetchCognitoUserInfo(cognitoDomain, params.accessToken);
        } else if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(
            `認証に失敗しました (${res.status} ${res.statusText})${body ? `: ${body}` : ""}`,
          );
        } else {
          userInfo = (await res.json()) as unknown;
        }

        const jwtPayload = decodeJwtPayload(params.accessToken);
        const context = extractTenantContext(
          userInfo,
          (typeof jwtPayload?.tenant_id === "string" && jwtPayload.tenant_id) || defaultTenantId,
        );
        const resolvedUserId =
          context.userId ??
          params.userId ??
          (typeof jwtPayload?.sub === "string" ? jwtPayload.sub : undefined);

        setAccessToken(params.accessToken);
        setRefreshToken(params.refreshToken || "");
        setUserId(resolvedUserId);

        if (!context.selectedTenantId) {
          if (context.tenants.length > 1) {
            setTenantOptions(context.tenants);
            setTenantId("");
            setError("テナントを選択してください。");
            return;
          }
          throw new Error("利用可能なテナントを取得できませんでした。");
        }

        finalizeLogin({
          tenantId: context.selectedTenantId,
          accessToken: params.accessToken,
          refreshToken: params.refreshToken,
          userId: resolvedUserId,
        });
      } catch (e) {
        if (e instanceof TypeError && e.message.includes("fetch")) {
          if (!defaultTenantId) {
            setError("ネットワークエラー時は既定のテナントIDが必要です。");
            return;
          }

          finalizeLogin({
            tenantId: defaultTenantId,
            accessToken: params.accessToken,
            refreshToken: params.refreshToken,
            userId: params.userId,
          });
          return;
        }

        setError(e instanceof Error ? e.message : "認証エラー");
      } finally {
        setIsLoading(false);
      }
    },
    [cognitoDomain, defaultTenantId, finalizeLogin, runtimeApiBaseUrl],
  );

  const handleBrowserLogin = useCallback(async () => {
    if (!hostedLoginReady) {
      setError("Cognito のログイン設定が不足しています。");
      return;
    }

    setError(null);

    try {
      const loginUrl = await buildOAuthLoginUrl({
        domain: cognitoDomain,
        clientId: cognitoClientId,
        redirectUri,
        scopes: cognitoScopes,
      });
      await open(loginUrl);
    } catch (e) {
      clearPendingOAuthState();
      setError(e instanceof Error ? e.message : "ブラウザログインの開始に失敗しました。");
    }
  }, [cognitoClientId, cognitoDomain, cognitoScopes, hostedLoginReady, redirectUri]);

  const handleTenantLogin = useCallback(() => {
    if (!tenantId || !accessToken) return;

    finalizeLogin({
      tenantId,
      accessToken,
      refreshToken: refreshToken || undefined,
      userId,
    });
  }, [accessToken, finalizeLogin, refreshToken, tenantId, userId]);

  const handleOAuthCallbackUrl = useCallback(
    async (rawUrl: string) => {
      const callback = parseOAuthCallback(rawUrl);
      if (!callback) {
        setError("callback URL を認識できませんでした。");
        return;
      }

      if (callback.error) {
        clearPendingOAuthState();
        setError(callback.errorDescription || callback.error);
        return;
      }

      if (!callback.code) {
        setError("callback URL に認証コードが含まれていません。");
        return;
      }

      const codeVerifier = consumeOAuthVerifier(callback.state);
      if (!codeVerifier) {
        setError("ログインセッションを復元できませんでした。もう一度ログインしてください。");
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        const tokens = await exchangeAuthorizationCode({
          domain: cognitoDomain,
          clientId: cognitoClientId,
          redirectUri,
          code: callback.code,
          codeVerifier,
        });

        await resolveTenantAndLogin({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        });
        setCallbackUrlInput("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "ログイン処理に失敗しました。");
        setIsLoading(false);
      }
    },
    [cognitoClientId, cognitoDomain, redirectUri, resolveTenantAndLogin],
  );

  const handleDeepLinkUrls = useCallback(
    async (urls: string[]) => {
      for (const rawUrl of urls) {
        if (!parseOAuthCallback(rawUrl)) continue;
        await handleOAuthCallbackUrl(rawUrl);
        return;
      }
    },
    [handleOAuthCallbackUrl],
  );

  useEffect(() => {
    if (!isTauri()) return;

    let isDisposed = false;
    let unlisten: (() => void) | undefined;

    void (async () => {
      const currentUrls = await getCurrent();
      if (!isDisposed && currentUrls?.length) {
        await handleDeepLinkUrls(currentUrls);
      }

      unlisten = await onOpenUrl((urls) => {
        void handleDeepLinkUrls(urls);
      });
    })();

    return () => {
      isDisposed = true;
      unlisten?.();
    };
  }, [handleDeepLinkUrls]);

  const inputClass = useMemo(
    () =>
      "w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 outline-none focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-indigo-400/20 placeholder:text-gray-400 dark:placeholder:text-slate-500 transition-colors duration-150",
    [],
  );
  const isBusy = isLoading || Boolean(isExchangingToken);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950 p-4 transition-colors duration-150">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center mx-auto mb-4">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="1.5"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Tachyon Cowork
          </h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
            AIアシスタントにサインイン
          </p>
        </div>

        <div className="space-y-4">
          {oauthError && (
            <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-400">
              サインインエラー: {oauthError}
            </div>
          )}

          <button
            type="button"
            onClick={handleBrowserLogin}
            disabled={isBusy || !hostedLoginReady}
            className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 dark:hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
          >
            {isBusy ? "ログイン処理中..." : "ブラウザでログイン"}
          </button>

          <p className="text-xs text-center text-gray-500 dark:text-slate-400 leading-5">
            ブラウザで認証したあと、自動でアプリに戻ります。
          </p>

          {isDevTauri && (
            <div className="space-y-2 rounded-xl border border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/70 dark:bg-amber-900/10 p-3">
              <p className="text-xs text-amber-800 dark:text-amber-300 leading-5">
                `tauri dev` では deep link が戻らないことがあります。ブラウザで認証後、
                `tachyon-cowork://...` の callback URL をここに貼ると、そのまま本物のログインを続行できます。
              </p>
              <input
                type="text"
                value={callbackUrlInput}
                onChange={(e) => {
                  setCallbackUrlInput(e.target.value);
                  setError(null);
                }}
                placeholder="tachyon-cowork://auth/callback?code=..."
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => void handleOAuthCallbackUrl(callbackUrlInput)}
                disabled={isBusy || !callbackUrlInput.trim()}
                className="w-full py-2.5 rounded-xl bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
              >
                callback URL で続行
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowManualLogin((prev) => !prev)}
            className="w-full text-xs text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 transition-colors duration-150"
          >
            {showManualLogin ? "手動ログインを閉じる" : "手動ログインを開く"}
          </button>

          {showManualLogin && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void resolveTenantAndLogin({
                  accessToken,
                  refreshToken: refreshToken || undefined,
                  userId,
                });
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  API URL
                </label>
                <input
                  type="url"
                  value={apiBaseUrl}
                  onChange={(e) => {
                    setApiBaseUrl(e.target.value);
                    setTenantOptions([]);
                    setTenantId(defaultTenantId);
                    setUserId(undefined);
                    setError(null);
                  }}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  アクセストークン
                </label>
                <input
                  type="password"
                  value={accessToken}
                  onChange={(e) => {
                    setAccessToken(e.target.value);
                    setRefreshToken("");
                    setTenantOptions([]);
                    setTenantId(defaultTenantId);
                    setUserId(undefined);
                    setError(null);
                  }}
                  className={inputClass}
                  required
                />
              </div>

              {tenantOptions.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    テナント
                  </label>
                  <select
                    value={tenantId}
                    onChange={(e) => setTenantId(e.target.value)}
                    className={inputClass}
                    required
                  >
                    <option value="" disabled>
                      テナントを選択
                    </option>
                    {tenantOptions.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {tenantOptions.length > 0 ? (
                <button
                  type="button"
                  onClick={handleTenantLogin}
                  disabled={isBusy || !tenantId || !accessToken}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 dark:hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
                >
                  続行
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={isBusy || !apiBaseUrl || !accessToken}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 dark:hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
                >
                  {isBusy ? "接続中..." : "手動ログイン"}
                </button>
              )}
            </form>
          )}

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-400">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
