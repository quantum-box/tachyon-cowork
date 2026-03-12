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
};

export function ToolsPanel({ onBack }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("search");

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="border-b border-gray-200">
        <div className="flex items-center gap-2 px-4 py-3">
          <button
            onClick={onBack}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            title="チャットに戻る"
          >
            <ArrowLeft size={18} />
          </button>
          <h2 className="text-sm font-semibold text-gray-800">
            ファイルツール
          </h2>
        </div>

        {/* Tab navigation */}
        <div className="flex border-t border-gray-100">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 text-xs font-medium transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? "border-indigo-500 text-indigo-600 bg-indigo-50/50"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
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
        {activeTab === "search" && <FileSearchPanel />}
        {activeTab === "organize" && <FileOrganizer />}
        {activeTab === "duplicates" && <DuplicateDetector />}
        {activeTab === "usage" && <DiskUsageChart />}
      </div>
    </div>
  );
}
