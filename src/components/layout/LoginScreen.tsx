import { useState } from "react";
import { type AuthState, buildAuthState } from "../../lib/auth";
import { ChevronDown, ChevronRight } from "lucide-react";

type Props = {
  onLogin: (auth: AuthState) => void;
};

export function LoginScreen({ onLogin }: Props) {
  const [apiBaseUrl, setApiBaseUrl] = useState("https://api.tachyon.dev");
  const [tenantId, setTenantId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiBaseUrl || !tenantId || !accessToken) return;

    setIsLoading(true);
    setError(null);

    try {
      // Verify credentials by calling the API
      const res = await fetch(`${apiBaseUrl}/auth/userinfo`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "x-operator-id": tenantId,
        },
      });

      if (!res.ok) {
        throw new Error("認証に失敗しました。トークンを確認してください。");
      }

      const userInfo = await res.json();
      const auth = buildAuthState({
        apiBaseUrl,
        accessToken,
        tenantId,
        userId: userInfo.sub || userInfo.user_id,
        refreshToken: refreshToken || undefined,
        clientId: clientId || undefined,
        clientSecret: clientSecret || undefined,
      });
      onLogin(auth);
    } catch (e) {
      // If auth endpoint fails, still save and try (dev mode)
      if (e instanceof TypeError && e.message.includes("fetch")) {
        // Network error - save anyway for development
        const auth = buildAuthState({
          apiBaseUrl,
          accessToken,
          tenantId,
          refreshToken: refreshToken || undefined,
          clientId: clientId || undefined,
          clientSecret: clientSecret || undefined,
        });
        onLogin(auth);
      } else {
        setError(e instanceof Error ? e.message : "認証エラー");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass =
    "w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 outline-none focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-indigo-400/20 placeholder:text-gray-400 dark:placeholder:text-slate-500 transition-colors duration-150";

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
            AIアシスタントにログイン
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              API URL
            </label>
            <input
              type="url"
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
              className={inputClass}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              テナントID
            </label>
            <input
              type="text"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              placeholder="tn_xxxx"
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
              onChange={(e) => setAccessToken(e.target.value)}
              className={inputClass}
              required
            />
          </div>

          {/* Collapsible advanced section for token refresh */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1 text-xs text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 transition-colors duration-150"
            >
              {showAdvanced ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
              トークン自動更新（オプション）
            </button>

            {showAdvanced && (
              <div className="mt-3 space-y-3 pl-1 border-l-2 border-indigo-200 dark:border-indigo-800 ml-1">
                <div className="pl-3">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    リフレッシュトークン
                  </label>
                  <input
                    type="password"
                    value={refreshToken}
                    onChange={(e) => setRefreshToken(e.target.value)}
                    placeholder="省略時はトークン期限切れで再ログイン"
                    className={inputClass}
                  />
                </div>
                <div className="pl-3">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    クライアントID
                  </label>
                  <input
                    type="text"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="pl-3">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    クライアントシークレット
                  </label>
                  <input
                    type="password"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !apiBaseUrl || !tenantId || !accessToken}
            className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 dark:hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
          >
            {isLoading ? "接続中..." : "ログイン"}
          </button>
        </form>
      </div>
    </div>
  );
}
