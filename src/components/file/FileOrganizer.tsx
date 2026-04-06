import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  FolderOpen,
  ArrowRight,
  Loader2,
  CheckCircle2,
  XCircle,
  FolderPlus,
  AlertTriangle,
} from "lucide-react";

type FileOperation = {
  source: string;
  destination: string;
  operation: string;
};

type OrganizePlan = {
  strategy: string;
  source_dir: string;
  operations: FileOperation[];
  conflicts: {
    source: string;
    destination: string;
    reason: string;
  }[];
  summary: {
    total_files: number;
    categories: Record<string, number>;
    dirs_to_create: number;
    movable_files: number;
    conflicts: number;
  };
};

type OperationResult = {
  source: string;
  destination: string;
  success: boolean;
  error: string | null;
};

type Strategy = "by_type" | "by_date" | "by_extension";

const STRATEGIES: { value: Strategy; label: string; description: string }[] = [
  { value: "by_type", label: "種類別", description: "画像、文書、動画など種類ごとに分類" },
  { value: "by_date", label: "日付別", description: "更新日の年月ごとに分類" },
  {
    value: "by_extension",
    label: "拡張子別",
    description: "ファイル拡張子ごとに分類",
  },
];

export function FileOrganizer() {
  const [directory, setDirectory] = useState("");
  const [strategy, setStrategy] = useState<Strategy>("by_type");
  const [plan, setPlan] = useState<OrganizePlan | null>(null);
  const [results, setResults] = useState<OperationResult[] | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBrowse = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === "string") {
      setDirectory(selected);
      setPlan(null);
      setResults(null);
      setError(null);
    }
  }, []);

  const handleCreatePlan = useCallback(async () => {
    if (!directory) return;
    setIsPlanning(true);
    setPlan(null);
    setResults(null);
    setError(null);
    try {
      const p = await invoke<OrganizePlan>("organize_files", {
        directory,
        strategy,
      });
      setPlan(p);
    } catch (err) {
      console.error("Plan error:", err);
      setError(err instanceof Error ? err.message : "整理プランの作成に失敗しました");
    } finally {
      setIsPlanning(false);
    }
  }, [directory, strategy]);

  const handleExecute = useCallback(async () => {
    if (!plan) return;
    setIsExecuting(true);
    setError(null);
    try {
      const res = await invoke<OperationResult[]>("execute_organize_plan", {
        operations: plan.operations,
      });
      setResults(res);
    } catch (err) {
      console.error("Execute error:", err);
      setError(err instanceof Error ? err.message : "整理の実行に失敗しました");
    } finally {
      setIsExecuting(false);
    }
  }, [plan]);

  const handleCancel = useCallback(() => {
    setPlan(null);
    setResults(null);
    setError(null);
  }, []);

  const successCount = results?.filter((r) => r.success).length ?? 0;
  const failCount = results?.filter((r) => !r.success).length ?? 0;

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="p-4 space-y-4 border-b border-gray-200 dark:border-slate-700">
        {/* Directory input */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={directory}
            onChange={(e) => setDirectory(e.target.value)}
            placeholder="整理するフォルダを選択..."
            className="flex-1 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500/20 dark:focus:ring-indigo-400/20 placeholder:text-gray-400 dark:placeholder:text-slate-500"
          />
          <button
            onClick={handleBrowse}
            className="shrink-0 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
          >
            <FolderOpen size={16} />
          </button>
        </div>

        {/* Strategy selection */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
            分類方法
          </label>
          <div className="space-y-1.5">
            {STRATEGIES.map((s) => (
              <label
                key={s.value}
                className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                  strategy === s.value
                    ? "border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/20"
                    : "border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700"
                }`}
              >
                <input
                  type="radio"
                  name="strategy"
                  value={s.value}
                  checked={strategy === s.value}
                  onChange={() => setStrategy(s.value)}
                  className="mt-0.5 accent-indigo-600"
                />
                <div>
                  <div className="text-sm font-medium text-gray-800 dark:text-gray-200">
                    {s.label}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-slate-400">{s.description}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <button
          onClick={handleCreatePlan}
          disabled={!directory || isPlanning}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPlanning ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              プラン作成中...
            </span>
          ) : (
            "プランを作成"
          )}
        </button>
      </div>

      {/* Plan display */}
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="mx-4 mt-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {plan && !results && (
          <div className="p-4 space-y-3">
            {/* Summary */}
            <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3">
              <div className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">
                整理プラン
              </div>
              <div className="text-xs text-blue-700 dark:text-blue-300">
                {plan.summary.total_files}ファイルのうち
                {plan.summary.movable_files}件を
                {Object.keys(plan.summary.categories).length}
                カテゴリに分類します
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.entries(plan.summary.categories).map(
                  ([cat, count]) => (
                    <span
                      key={cat}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs"
                    >
                      {cat}: {count}
                    </span>
                  ),
                )}
              </div>
            </div>

            {plan.summary.conflicts > 0 && (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-200">
                  <AlertTriangle size={14} />
                  同名ファイルの衝突が {plan.summary.conflicts} 件あります
                </div>
                <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                  既存ファイルを上書きしないよう、衝突したファイルは実行対象から外しています。
                </div>
                <div className="mt-2 space-y-1">
                  {plan.conflicts.slice(0, 5).map((conflict) => (
                    <div
                      key={`${conflict.source}->${conflict.destination}`}
                      className="rounded bg-amber-100/70 dark:bg-amber-900/30 px-2 py-1 text-[11px] text-amber-900 dark:text-amber-200"
                    >
                      {conflict.source.split(/[/\\]/).pop()} → {conflict.destination.split(/[/\\]/).pop()}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Operation list */}
            <div className="space-y-1">
              {plan.operations.map((op, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-3 py-1.5 rounded bg-gray-50 dark:bg-slate-800 text-xs"
                >
                  {op.operation === "create_dir" ? (
                    <>
                      <FolderPlus size={12} className="text-amber-500 dark:text-amber-400 shrink-0" />
                      <span className="text-gray-600 dark:text-gray-400 truncate">
                        フォルダ作成: {op.destination.split("/").pop() ?? op.destination.split("\\").pop()}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-gray-600 dark:text-gray-400 truncate flex-1 min-w-0">
                        {op.source.split("/").pop() ?? op.source.split("\\").pop()}
                      </span>
                      <ArrowRight size={12} className="text-gray-400 dark:text-slate-500 shrink-0" />
                      <span className="text-indigo-600 dark:text-indigo-400 truncate flex-1 min-w-0 text-right">
                        {op.destination.split("/").pop() ?? op.destination.split("\\").pop()}
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleExecute}
                disabled={isExecuting || plan.summary.movable_files === 0}
                className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {isExecuting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    実行中...
                  </span>
                ) : (
                  "実行する"
                )}
              </button>
              <button
                onClick={handleCancel}
                disabled={isExecuting}
                className="flex-1 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        )}

        {/* Results */}
        {results && (
          <div className="p-4 space-y-3">
            <div
              className={`rounded-lg p-3 border ${
                failCount === 0
                  ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                  : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
              }`}
            >
              <div className="flex items-center gap-2 text-sm font-medium mb-1">
                {failCount === 0 ? (
                  <>
                    <CheckCircle2 size={16} className="text-green-600 dark:text-green-400" />
                    <span className="text-green-800 dark:text-green-200">完了</span>
                  </>
                ) : (
                  <>
                    <XCircle size={16} className="text-amber-600 dark:text-amber-400" />
                    <span className="text-amber-800 dark:text-amber-200">一部エラー</span>
                  </>
                )}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                成功: {successCount} / 失敗: {failCount}
              </div>
            </div>

            {results
              .filter((r) => !r.success)
              .map((r, i) => (
                <div
                  key={i}
                  className="px-3 py-2 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-400"
                >
                  {r.source.split("/").pop() ?? r.source.split("\\").pop()}: {r.error}
                </div>
              ))}

            <button
              onClick={handleCancel}
              className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
            >
              戻る
            </button>
          </div>
        )}

        {!plan && !results && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-slate-500">
            <FolderOpen size={32} className="mb-2 opacity-50" />
            <p className="text-sm">フォルダを選択してプランを作成</p>
          </div>
        )}
      </div>
    </div>
  );
}
