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

export function FileSearchPanel() {
  const [directory, setDirectory] = useState("");
  const [searchText, setSearchText] = useState("");
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [results, setResults] = useState<FileInfo[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleBrowse = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === "string") {
      setDirectory(selected);
    }
  }, []);

  const toggleFilter = useCallback((label: string) => {
    setActiveFilters((prev) =>
      prev.includes(label)
        ? prev.filter((f) => f !== label)
        : [...prev, label],
    );
  }, []);

  const handleSearch = useCallback(async () => {
    if (!directory) return;
    setIsSearching(true);
    setSearched(true);
    try {
      const activeExts = EXTENSION_FILTERS.filter((f) =>
        activeFilters.includes(f.label),
      ).flatMap((f) => f.extensions);

      const files = await invoke<FileInfo[]>("search_files", {
        directory,
        pattern: searchText || null,
        extensions: activeExts.length > 0 ? activeExts : null,
        maxResults: 200,
      });
      setResults(files);
    } catch (err) {
      console.error("Search error:", err);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [directory, searchText, activeFilters]);

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

        {/* Extension filter chips */}
        <div className="flex flex-wrap gap-1.5">
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
            </div>
            {results.map((file) => (
              <div
                key={file.path}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-slate-800 group transition-colors"
              >
                <div className="shrink-0 text-gray-400 dark:text-slate-500">
                  {file.is_dir ? (
                    <Folder size={16} />
                  ) : (
                    <File size={16} />
                  )}
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
