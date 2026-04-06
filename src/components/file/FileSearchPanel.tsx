import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Search,
  FolderOpen,
  File,
  Folder,
  ExternalLink,
  Loader2,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { formatFileSize } from "../../lib/format";

type FileInfo = {
  path: string;
  name: string;
  size: number;
  is_dir: boolean;
  mime_type: string | null;
  modified: string | null;
  created: string | null;
  extension: string | null;
};

const EXTENSION_FILTERS: { label: string; extensions: string[] }[] = [
  { label: "画像", extensions: ["jpg", "jpeg", "png", "gif", "svg", "webp"] },
  { label: "文書", extensions: ["doc", "docx", "txt", "rtf", "md"] },
  { label: "Excel", extensions: ["xls", "xlsx", "csv"] },
  { label: "PDF", extensions: ["pdf"] },
  { label: "動画", extensions: ["mp4", "avi", "mov", "mkv"] },
  { label: "音楽", extensions: ["mp3", "wav", "flac", "aac"] },
  { label: "アーカイブ", extensions: ["zip", "rar", "7z", "tar", "gz"] },
];

type SortMode = "modified_desc" | "name_asc" | "size_desc";

function sortResults(files: FileInfo[], mode: SortMode): FileInfo[] {
  const next = [...files];
  next.sort((a, b) => {
    if (mode === "name_asc") {
      return a.name.localeCompare(b.name, "ja");
    }
    if (mode === "size_desc") {
      return b.size - a.size;
    }
    return (b.modified ?? "").localeCompare(a.modified ?? "");
  });
  return next;
}

export function FileSearchPanel() {
  const [directory, setDirectory] = useState("");
  const [searchText, setSearchText] = useState("");
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [results, setResults] = useState<FileInfo[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("modified_desc");
  const [recursive, setRecursive] = useState(true);
  const [includeHidden, setIncludeHidden] = useState(false);
  const [maxResults, setMaxResults] = useState(500);
  const [error, setError] = useState<string | null>(null);

  const handleBrowse = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === "string") {
      setDirectory(selected);
    }
  }, []);

  const toggleFilter = useCallback((label: string) => {
    setActiveFilters((prev) =>
      prev.includes(label) ? prev.filter((f) => f !== label) : [...prev, label],
    );
  }, []);

  const handleSearch = useCallback(async () => {
    if (!directory) return;
    setIsSearching(true);
    setSearched(true);
    setError(null);
    try {
      const activeExts = EXTENSION_FILTERS.filter((f) => activeFilters.includes(f.label)).flatMap(
        (f) => f.extensions,
      );

      const files = await invoke<FileInfo[]>("search_files", {
        directory,
        pattern: searchText || null,
        extensions: activeExts.length > 0 ? activeExts : null,
        maxResults,
        recursive,
        includeHidden,
      });
      setResults(sortResults(files, sortMode));
    } catch (err) {
      console.error("Search error:", err);
      setResults([]);
      setError(err instanceof Error ? err.message : "検索に失敗しました");
    } finally {
      setIsSearching(false);
    }
  }, [activeFilters, directory, includeHidden, maxResults, recursive, searchText, sortMode]);

  const handleShowInFolder = useCallback(async (path: string) => {
    try {
      await invoke("show_in_folder", { path });
    } catch (err) {
      console.error("show_in_folder error:", err);
    }
  }, []);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  };

  const clearSearch = useCallback(() => {
    setSearchText("");
    setActiveFilters([]);
    setResults([]);
    setSearched(false);
    setError(null);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Search controls */}
      <div className="p-4 space-y-3 border-b border-gray-200 dark:border-slate-700">
        {/* Directory input */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={directory}
            onChange={(e) => setDirectory(e.target.value)}
            placeholder="検索するフォルダを選択..."
            className="flex-1 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500/20 dark:focus:ring-indigo-400/20 placeholder:text-gray-400 dark:placeholder:text-slate-500"
          />
          <button
            onClick={handleBrowse}
            className="shrink-0 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
          >
            <FolderOpen size={16} />
          </button>
        </div>

        {/* Search text */}
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500"
          />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
            placeholder="ファイル名で検索..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-gray-100 outline-none focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500/20 dark:focus:ring-indigo-400/20 placeholder:text-gray-400 dark:placeholder:text-slate-500"
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-slate-400">
            <SlidersHorizontal size={12} />
            <span>並び順</span>
          </div>
          <select
            value={sortMode}
            onChange={(e) => {
              const nextMode = e.target.value as SortMode;
              setSortMode(nextMode);
              setResults((prev) => sortResults(prev, nextMode));
            }}
            className="rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-xs text-gray-700 dark:text-gray-200"
          >
            <option value="modified_desc">更新日順</option>
            <option value="name_asc">名前順</option>
            <option value="size_desc">サイズ順</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-slate-400">
            <input
              type="checkbox"
              checked={recursive}
              onChange={(e) => setRecursive(e.target.checked)}
              className="accent-indigo-600"
            />
            サブフォルダを含む
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-slate-400">
            <input
              type="checkbox"
              checked={includeHidden}
              onChange={(e) => setIncludeHidden(e.target.checked)}
              className="accent-indigo-600"
            />
            隠しファイルを含む
          </label>
        </div>

        <div className="flex items-center justify-between gap-2">
          <label className="text-[11px] text-gray-500 dark:text-slate-400">取得件数上限</label>
          <select
            value={maxResults}
            onChange={(e) => setMaxResults(Number(e.target.value))}
            className="rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-xs text-gray-700 dark:text-gray-200"
          >
            <option value={200}>200件</option>
            <option value={500}>500件</option>
            <option value={1000}>1000件</option>
            <option value={2000}>2000件</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {EXTENSION_FILTERS.map((filter) => (
            <button
              key={filter.label}
              onClick={() => toggleFilter(filter.label)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                activeFilters.includes(filter.label)
                  ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700"
                  : "bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-slate-600 hover:bg-gray-200 dark:hover:bg-slate-600"
              }`}
            >
              {filter.label}
            </button>
          ))}
          {(searchText || activeFilters.length > 0) && (
            <button
              onClick={clearSearch}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700"
            >
              <X size={12} />
              クリア
            </button>
          )}
        </div>

        {/* Search button */}
        <button
          onClick={handleSearch}
          disabled={!directory || isSearching}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSearching ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              検索中...
            </span>
          ) : (
            "検索"
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

        {!searched && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-slate-500">
            <Search size={32} className="mb-2 opacity-50" />
            <p className="text-sm">検索条件を入力してください</p>
          </div>
        )}

        {searched && results.length === 0 && !isSearching && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-slate-500">
            <File size={32} className="mb-2 opacity-50" />
            <p className="text-sm">該当するファイルが見つかりませんでした</p>
          </div>
        )}

        {results.length > 0 && (
          <div className="divide-y divide-gray-100 dark:divide-slate-800">
            <div className="px-4 py-2 text-xs text-gray-500 dark:text-slate-400 bg-gray-50 dark:bg-slate-800">
              {results.length}件のファイル
              {searchText ? ` / "${searchText}"` : ""}
              {activeFilters.length > 0 ? ` / ${activeFilters.join("・")}` : ""}
              {results.length === maxResults ? " / 上限到達" : ""}
            </div>
            {results.map((file) => (
              <div
                key={file.path}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-slate-800 group transition-colors"
              >
                <div className="shrink-0 text-gray-400 dark:text-slate-500">
                  {file.is_dir ? <Folder size={16} /> : <File size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-800 dark:text-gray-200 truncate">
                    {file.name}
                  </div>
                  <div className="text-[11px] text-gray-400 dark:text-slate-500 truncate">
                    {file.path}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xs text-gray-500 dark:text-slate-400">
                    {formatFileSize(file.size)}
                  </div>
                  <div className="text-[11px] text-gray-400 dark:text-slate-500">
                    {formatDate(file.modified)}
                  </div>
                </div>
                <button
                  onClick={() => handleShowInFolder(file.path)}
                  className="shrink-0 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-gray-300 transition-all"
                  title="フォルダで開く"
                >
                  <ExternalLink size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
