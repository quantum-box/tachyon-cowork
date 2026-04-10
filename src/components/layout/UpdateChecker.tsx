import { useEffect, useState } from "react";
import { isTauri } from "../../lib/tauri-bridge";

type UpdateStatus = "idle" | "checking" | "available" | "downloading" | "done" | "error";

export function UpdateChecker() {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [version, setVersion] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isTauri()) return;

    let cancelled = false;

    const timer = setTimeout(async () => {
      if (cancelled) return;
      try {
        setStatus("checking");
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (cancelled) return;

        if (update) {
          setVersion(update.version);
          setStatus("available");
        } else {
          setStatus("idle");
        }
      } catch (e) {
        if (cancelled) return;
        console.warn("Update check failed:", e);
        setStatus("idle");
      }
    }, 5000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  async function handleUpdate() {
    try {
      setStatus("downloading");
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update) {
        await update.downloadAndInstall();
        setStatus("done");
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      }
    } catch (e) {
      setError(String(e));
      setStatus("error");
    }
  }

  if (status === "idle" || status === "checking") return null;

  return (
    <div className="px-3 pb-2">
      {status === "available" && (
        <button
          onClick={handleUpdate}
          className="w-full text-left px-3 py-2 rounded-lg text-xs bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
        >
          <div className="font-medium">v{version} が利用可能</div>
          <div className="text-[11px] opacity-75">クリックしてアップデート</div>
        </button>
      )}
      {status === "downloading" && (
        <div className="px-3 py-2 rounded-lg text-xs bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400">
          ダウンロード中...
        </div>
      )}
      {status === "done" && (
        <div className="px-3 py-2 rounded-lg text-xs bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300">
          アップデート完了 - 再起動します
        </div>
      )}
      {status === "error" && (
        <div className="px-3 py-2 rounded-lg text-xs bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400">
          更新エラー: {error}
        </div>
      )}
    </div>
  );
}
