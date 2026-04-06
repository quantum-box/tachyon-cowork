import { useState, useCallback, useMemo, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  FolderOpen,
  Copy,
  Loader2,
  Trash2,
  Hash,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { formatFileSize } from "../../lib/format";

type DuplicateGroup = {
  hash: string;
  size: number;
  files: string[];
};

export function DuplicateDetector({ defaultDirectory }: { defaultDirectory?: string | null }) {
  const [directory, setDirectory] = useState(defaultDirectory ?? "");
  const [recursive, setRecursive] = useState(true);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteComplete, setDeleteComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDirectory(defaultDirectory ?? "");
  }, [defaultDirectory]);

  const handleBrowse = useCallback(async () => {
    const sel = await open({ directory: true, multiple: false });
    if (sel && typeof sel === "string") {
      setDirectory(sel);
      setGroups([]);
      setScanned(false);
      setSelected(new Set());
      setDeleteComplete(false);
      setError(null);
    }
  }, []);

  const handleScan = useCallback(async () => {
    if (!directory) return;
    setIsScanning(true);
    setScanned(true);
    setSelected(new Set());
    setDeleteComplete(false);
    setError(null);
    try {
      const dups = await invoke<DuplicateGroup[]>("find_duplicates", {
        directory,
        recursive,
      });
      setGroups(dups);
    } catch (err) {
      console.error("Scan error:", err);
      setGroups([]);
      setError(err instanceof Error ? err.message : "重複スキャンに失敗しました");
    } finally {
      setIsScanning(false);
    }
  }, [directory, recursive]);

  const toggleSelect = useCallback((path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleDeleteSelected = useCallback(async () => {
    if (selected.size === 0) return;
    setIsDeleting(true);
    setError(null);
    try {
      for (const path of selected) {
        await invoke("move_to_trash", { path });
      }
      // Remove deleted files from groups
      setGroups((prev) =>
        prev
          .map((g) => ({
            ...g,
            files: g.files.filter((f) => !selected.has(f)),
          }))
          .filter((g) => g.files.length > 1),
      );
      setSelected(new Set());
      setDeleteComplete(true);
    } catch (err) {
      console.error("Delete error:", err);
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    } finally {
      setIsDeleting(false);
    }
  }, [selected]);

  const selectAllDuplicates = useCallback(() => {
    setSelected(
      new Set(
        groups.flatMap((group) => group.files.slice(1)),
      ),
    );
  }, [groups]);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
  }, []);

  const handleShowInFolder = useCallback(async (path: string) => {
    try {
      await invoke("show_in_folder", { path });
    } catch (err) {
      console.error("show_in_folder error:", err);
      setError(err instanceof Error ? err.message : "フォルダを開けませんでした");
    }
  }, []);

  const summary = useMemo(() => {
    const totalDuplicates = groups.reduce(
      (sum, g) => sum + (g.files.length - 1),
      0,
    );
    const saveable = groups.reduce(
      (sum, g) => sum + g.size * (g.files.length - 1),
      0,
    );
    return {
      groupCount: groups.length,
      duplicateCount: totalDuplicates,
      saveable,
    };
  }, [groups]);

  const selectedBytes = useMemo(
    () =>
      groups.reduce((total, group) => {
        const selectedCount = group.files.filter((file) => selected.has(file)).length;
        return total + group.size * selectedCount;
      }, 0),
    [groups, selected],
  );

  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => b.size * (b.files.length - 1) - a.size * (a.files.length - 1)),
    [groups],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="p-4 space-y-3 border-b border-gray-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={directory}
            onChange={(e) => setDirectory(e.target.value)}
            placeholder="スキャンするフォルダを選択..."
            className="flex-1 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500/20 dark:focus:ring-indigo-400/20 placeholder:text-gray-400 dark:placeholder:text-slate-500"
          />
          <button
            onClick={handleBrowse}
            className="shrink-0 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
          >
            <FolderOpen size={16} />
          </button>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={recursive}
            onChange={(e) => setRecursive(e.target.checked)}
            className="accent-indigo-600"
          />
          サブフォルダも含める
        </label>

        <button
          onClick={handleScan}
          disabled={!directory || isScanning}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isScanning ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              スキャン中...
            </span>
          ) : (
            "スキャン"
          )}
        </button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="mx-4 mt-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {!scanned && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-slate-500">
            <Copy size={32} className="mb-2 opacity-50" />
            <p className="text-sm">フォルダを選択してスキャン</p>
          </div>
        )}

        {scanned && !isScanning && groups.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-slate-500">
            <CheckCircle2 size={32} className="mb-2 opacity-50" />
            <p className="text-sm">重複ファイルはありませんでした</p>
          </div>
        )}

        {groups.length > 0 && (
          <div className="p-4 space-y-3">
            {/* Summary */}
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3">
              <div className="text-sm font-medium text-amber-800 dark:text-amber-200">
                {summary.groupCount}グループ, {summary.duplicateCount}
                個の重複, {formatFileSize(summary.saveable)} 節約可能
              </div>
              <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                先頭のファイルを保持対象として固定し、残りだけ選択できます。
              </div>
            </div>

            {deleteComplete && (
              <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3 text-sm text-green-700 dark:text-green-400">
                選択したファイルをゴミ箱に移動しました
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={selectAllDuplicates}
                className="flex-1 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
              >
                重複分を全選択
              </button>
              <button
                onClick={clearSelection}
                className="flex-1 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
              >
                選択解除
              </button>
            </div>

            {/* Delete button */}
            {selected.size > 0 && (
              <button
                onClick={handleDeleteSelected}
                disabled={isDeleting}
                className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {isDeleting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    削除中...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Trash2 size={14} />
                    選択したファイルをゴミ箱に移動 ({selected.size}件 / {formatFileSize(selectedBytes)})
                  </span>
                )}
              </button>
            )}

            {/* Duplicate groups */}
            {sortedGroups.map((group) => (
              <div
                key={group.hash}
                className="rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden"
              >
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
                  <Hash size={12} className="text-gray-400 dark:text-slate-500" />
                  <span className="text-xs text-gray-500 dark:text-slate-400 font-mono truncate">
                    {group.hash.slice(0, 16)}...
                  </span>
                  <span className="text-xs text-gray-400 dark:text-slate-500 ml-auto">
                    {formatFileSize(group.size)} x {group.files.length} / 節約 {formatFileSize(group.size * (group.files.length - 1))}
                  </span>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-slate-800">
                  {group.files.map((file, i) => (
                    <label
                      key={file}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(file)}
                        onChange={() => toggleSelect(file)}
                        disabled={i === 0}
                        className="accent-red-600 disabled:opacity-30"
                      />
                      <span
                        className={`truncate ${i === 0 ? "text-green-700 dark:text-green-400 font-medium" : "text-gray-700 dark:text-gray-300"}`}
                      >
                        {i === 0 && "(保持) "}
                        {file}
                      </span>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void handleShowInFolder(file);
                        }}
                        className="ml-auto shrink-0 p-1 rounded text-gray-400 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
                        title="フォルダで開く"
                      >
                        <ExternalLink size={12} />
                      </button>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
