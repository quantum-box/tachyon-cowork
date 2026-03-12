import { useState } from "react";
import { type AuthState, saveAuth } from "../../lib/auth";

type Props = {
  onLogin: (auth: AuthState) => void;
};

export function LoginScreen({ onLogin }: Props) {
  const [apiBaseUrl, setApiBaseUrl] = useState("https://api.tachyon.dev");
  const [tenantId, setTenantId] = useState("");
  const [accessToken, setAccessToken] = useState("");
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
      const auth: AuthState = {
        apiBaseUrl,
        accessToken,
        tenantId,
        userId: userInfo.sub || userInfo.user_id,
      };
      saveAuth(auth);
      onLogin(auth);
    } catch (e) {
      // If auth endpoint fails, still save and try (dev mode)
      if (e instanceof TypeError && e.message.includes("fetch")) {
        // Network error - save anyway for development
        const auth: AuthState = { apiBaseUrl, accessToken, tenantId };
        saveAuth(auth);
        onLogin(auth);
      } else {
        setError(e instanceof Error ? e.message : "認証エラー");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
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
          <h1 className="text-xl font-bold text-gray-900">Tachyon Cowork</h1>
          <p className="text-sm text-gray-500 mt-1">
            AIアシスタントにログイン
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              API URL
            </label>
            <input
              type="url"
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              テナントID
            </label>
            <input
              type="text"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              placeholder="tn_xxxx"
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              アクセストークン
            </label>
            <input
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              required
            />
          </div>

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !apiBaseUrl || !tenantId || !accessToken}
            className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? "接続中..." : "ログイン"}
          </button>
        </form>
      </div>
    </div>
  );
}
