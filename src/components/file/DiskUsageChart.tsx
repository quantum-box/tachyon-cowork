import { useState, useCallback, useMemo, useEffect } from "react";
import { FolderOpen, HardDrive, Loader2 } from "lucide-react";
import { formatFileSize } from "../../lib/format";

type ExtensionUsage = {
  count: number;
  total_size: number;
};

type DiskUsage = {
  total_size: number;
  file_count: number;
  dir_count: number;
  by_extension: Record<string, ExtensionUsage>;
};

const BAR_COLORS = [
  "bg-indigo-500",
  "bg-blue-500",
  "bg-cyan-500",
  "bg-teal-500",
  "bg-green-500",
  "bg-amber-500",
  "bg-orange-500",
  "bg-red-500",
  "bg-pink-500",
  "bg-purple-500",
];

export function DiskUsageChart({ defaultDirectory }: { defaultDirectory?: string | null }) {
  const [directory, setDirectory] = useState(defaultDirectory ?? "");
  const [usage, setUsage] = useState<DiskUsage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);

  useEffect(() => {
    setDirectory(defaultDirectory ?? "");
  }, [defaultDirectory]);

  const handleBrowse = useCallback(async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const sel = await open({ directory: true, multiple: false });
    if (sel && typeof sel === "string") {
      setDirectory(sel);
      setUsage(null);
      setAnalyzed(false);
    }
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!directory) return;
    setIsLoading(true);
    setAnalyzed(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const data = await invoke<DiskUsage>("get_disk_usage", { directory });
      setUsage(data);
    } catch (err) {
      console.error("Disk usage error:", err);
      setUsage(null);
    } finally {
      setIsLoading(false);
    }
  }, [directory]);

  const sorted = useMemo(() => {
    if (!usage) return [];
    return Object.entries(usage.by_extension)
      .sort(([, a], [, b]) => b.total_size - a.total_size)
      .slice(0, 20);
  }, [usage]);

  const maxSize = sorted.length > 0 ? sorted[0][1].total_size : 1;

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="p-4 space-y-3 border-b border-gray-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={directory}
            onChange={(e) => setDirectory(e.target.value)}
            placeholder="分析するフォルダを選択..."
            className="flex-1 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500/20 dark:focus:ring-indigo-400/20 placeholder:text-gray-400 dark:placeholder:text-slate-500"
          />
          <button
            onClick={handleBrowse}
            className="shrink-0 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
          >
            <FolderOpen size={16} />
          </button>
        </div>

        <button
          onClick={handleAnalyze}
          disabled={!directory || isLoading}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              分析中...
            </span>
          ) : (
            "分析"
          )}
        </button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {!analyzed && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-slate-500">
            <HardDrive size={32} className="mb-2 opacity-50" />
            <p className="text-sm">フォルダを選択して分析</p>
          </div>
        )}

        {analyzed && !isLoading && !usage && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-slate-500">
            <HardDrive size={32} className="mb-2 opacity-50" />
            <p className="text-sm">分析できませんでした</p>
          </div>
        )}

        {usage && (
          <div className="p-4 space-y-4">
            {/* Summary */}
            <div className="rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 p-3">
              <div className="text-sm font-medium text-indigo-800 dark:text-indigo-200">
                合計: {formatFileSize(usage.total_size)},{" "}
                {usage.file_count.toLocaleString()}ファイル
              </div>
              <div className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">
                {usage.dir_count.toLocaleString()}フォルダ
              </div>
            </div>

            {/* Bar chart */}
            <div className="space-y-2">
              {sorted.map(([ext, data], i) => {
                const pct = (data.total_size / maxSize) * 100;
                const color = BAR_COLORS[i % BAR_COLORS.length];
                return (
                  <div key={ext}>
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        .{ext}
                      </span>
                      <span className="text-gray-500 dark:text-slate-400">
                        {formatFileSize(data.total_size)} ({data.count}件)
                      </span>
                    </div>
                    <div className="h-5 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${color} rounded-full transition-all`}
                        style={{ width: `${Math.max(pct, 1)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
