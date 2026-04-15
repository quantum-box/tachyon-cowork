import { useState } from "react";
import { Search, FolderOpen, Copy, HardDrive, ArrowLeft } from "lucide-react";
import { FileSearchPanel } from "../file/FileSearchPanel";
import { FileOrganizer } from "../file/FileOrganizer";
import { DuplicateDetector } from "../file/DuplicateDetector";
import { DiskUsageChart } from "../file/DiskUsageChart";

type Tab = "search" | "organize" | "duplicates" | "usage";

const TABS: { id: Tab; label: string; icon: typeof Search }[] = [
  { id: "search", label: "ファイル検索", icon: Search },
  { id: "organize", label: "整理", icon: FolderOpen },
  { id: "duplicates", label: "重複検出", icon: Copy },
  { id: "usage", label: "容量分析", icon: HardDrive },
];

type Props = {
  onBack: () => void;
  backLabel?: string;
  title?: string;
  description?: string;
  projectDirectory?: string | null;
};

export function ToolsPanel({
  onBack,
  backLabel = "チャットに戻る",
  title = "ファイルツール",
  description = "ローカルの検索・整理・重複検出・容量分析",
  projectDirectory,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("search");

  return (
    <div className="flex h-full flex-col bg-transparent transition-colors duration-150">
      {/* Header */}
      <div className="border-b border-stone-200/80 bg-white/55 px-4 py-4 backdrop-blur-md dark:border-stone-800/80 dark:bg-stone-950/25">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="notion-icon-button p-2"
            title={backLabel}
          >
            <ArrowLeft size={18} />
          </button>
          <div
            className="titlebar-safe-header titlebar-safe-start"
            data-tauri-drag-region
          >
            <div className="notion-label mb-1">Tools</div>
            <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-100">
              {title}
            </h2>
            <p className="text-[11px] text-stone-500 dark:text-stone-400">
              {description}
            </p>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="mt-4 flex rounded-[20px] border border-stone-200/80 bg-white/70 p-1 dark:border-stone-800 dark:bg-stone-900/60">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-2xl px-2 py-2.5 text-xs font-medium transition-colors ${
                  activeTab === tab.id
                    ? "bg-white text-stone-900 shadow-[0_8px_18px_rgba(15,23,42,0.05)] dark:bg-stone-950 dark:text-stone-100"
                    : "text-stone-500 hover:bg-white/70 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-900/80 dark:hover:text-stone-100"
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0">
        {activeTab === "search" && (
          <FileSearchPanel defaultDirectory={projectDirectory} />
        )}
        {activeTab === "organize" && (
          <FileOrganizer defaultDirectory={projectDirectory} />
        )}
        {activeTab === "duplicates" && (
          <DuplicateDetector defaultDirectory={projectDirectory} />
        )}
        {activeTab === "usage" && (
          <DiskUsageChart defaultDirectory={projectDirectory} />
        )}
      </div>
    </div>
  );
}
