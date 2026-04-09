import { useState } from "react";
import {
  MessageSquarePlus,
  Search,
  Trash2,
  Settings,
  LogOut,
  FolderOpen,
  Pin,
  PinOff,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import type { SessionSummary } from "../../lib/types";
import type { ProjectEntry } from "../../lib/tauri-bridge";

type Props = {
  sessions: SessionSummary[];
  activeSessionId: string | null;
  pinnedRooms: string[];
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onDeleteRoom: (id: string) => void;
  onTogglePin: (id: string) => void;
  onLogout: () => void;
  onToggleTools: () => void;
  showTools: boolean;
  showWorkFolders: boolean;
  onOpenSettings: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  activeProject?: ProjectEntry | null;
  recentProjects: ProjectEntry[];
  onPickProject: () => void;
  onOpenWorkFolderList: (path?: string) => void;
  isProjectLoading?: boolean;
};

export function Sidebar({
  sessions,
  activeSessionId,
  pinnedRooms,
  onNewChat,
  onSelectSession,
  onDeleteRoom,
  onTogglePin,
  onLogout,
  onToggleTools,
  showTools,
  showWorkFolders,
  onOpenSettings,
  isCollapsed = false,
  onToggleCollapse,
  activeProject,
  recentProjects,
  onPickProject,
  onOpenWorkFolderList,
  isProjectLoading = false,
}: Props) {
  const [search, setSearch] = useState("");
  const recentWorkFolders = recentProjects.slice(0, 3);

  const filtered = search
    ? sessions.filter((r) =>
        r.name.toLowerCase().includes(search.toLowerCase()),
      )
    : sessions;

  // Separate pinned rooms from the rest
  const pinned = filtered.filter((r) => pinnedRooms.includes(r.id));
  const unpinned = filtered.filter((r) => !pinnedRooms.includes(r.id));

  // Group unpinned by date
  const grouped = groupByDate(unpinned);

  if (isCollapsed) {
    return (
      <div className="flex flex-col items-center h-full bg-gray-50 dark:bg-slate-900 border-r border-gray-200 dark:border-slate-700 py-3 gap-2 w-12">
        <button
          onClick={onToggleCollapse}
          className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-800 text-gray-500 dark:text-slate-400 transition-colors"
          title="サイドバーを開く"
        >
          <PanelLeftOpen size={18} />
        </button>
        <button
          onClick={onNewChat}
          className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-800 text-gray-600 dark:text-gray-400 transition-colors"
          title="新しいチャット"
        >
          <MessageSquarePlus size={18} />
        </button>
        <div className="flex-1" />
        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-800 text-gray-500 dark:text-slate-400 transition-colors"
          title="設定"
        >
          <Settings size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-slate-900 border-r border-gray-200 dark:border-slate-700 transition-colors duration-150">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-slate-700">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-sm font-semibold text-gray-800 dark:text-gray-200 tracking-tight">
            Tachyon Cowork
          </h1>
          <div className="flex items-center gap-0.5">
            {onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-800 text-gray-500 dark:text-slate-400 transition-colors duration-150"
                title="サイドバーを閉じる"
              >
                <PanelLeftClose size={18} />
              </button>
            )}
            <button
              onClick={onNewChat}
              className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-800 text-gray-600 dark:text-gray-400 transition-colors duration-150"
              title="新しいチャット"
            >
              <MessageSquarePlus size={18} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="検索..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/20 placeholder:text-gray-400 dark:placeholder:text-slate-500 transition-colors duration-150"
          />
        </div>

        <div className="mt-3">
          <div className="px-1 pb-1 text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-slate-500">
            作業ディレクトリ
          </div>
          <WorkFolderItem
            label="作業ディレクトリ一覧"
            subtitle={activeProject?.name ?? "未選択でもチャットは開始できます"}
            isActive={showWorkFolders}
            isLoading={isProjectLoading}
            onOpen={onOpenWorkFolderList}
            onPick={!activeProject ? onPickProject : undefined}
          />
          {recentWorkFolders.length > 0 && (
            <div className="mt-2 space-y-1">
              {recentWorkFolders.map((project) => {
                const isCurrent = activeProject?.path === project.path;
                return (
                  <button
                    key={project.path}
                    type="button"
                    onClick={() => onOpenWorkFolderList(project.path)}
                    className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${
                      isCurrent
                        ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300"
                        : "text-gray-600 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    }`}
                  >
                    <div className="truncate text-xs font-medium">
                      {project.name}
                    </div>
                    <div className="truncate text-[11px] text-gray-400 dark:text-slate-500">
                      {project.path}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* File Tools button */}
      <div className="px-3 pt-3">
        <button
          onClick={onToggleTools}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
            showTools
              ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700"
              : "bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-slate-600 hover:bg-gray-100 dark:hover:bg-slate-700"
          }`}
        >
          <FolderOpen size={14} />
          ファイルツール
        </button>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto py-2">
        {/* Pinned section */}
        {pinned.length > 0 && (
          <div>
            <div className="px-4 py-1.5 text-[10px] font-medium text-gray-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <Pin size={10} />
              ピン留め
            </div>
            {pinned.map((room) => (
              <ChatRoomItem
                key={room.id}
                room={room}
                isActive={room.id === activeSessionId}
                isPinned={true}
                onSelect={() => onSelectSession(room.id)}
                onDelete={() => onDeleteRoom(room.id)}
                onTogglePin={() => onTogglePin(room.id)}
              />
            ))}
          </div>
        )}

        {/* Date-grouped rooms */}
        {Object.entries(grouped).map(([label, rooms]) => (
          <div key={label}>
            <div className="px-4 py-1.5 text-[10px] font-medium text-gray-400 dark:text-slate-500 uppercase tracking-wider">
              {label}
            </div>
            {rooms.map((room) => (
              <ChatRoomItem
                key={room.id}
                room={room}
                isActive={room.id === activeSessionId}
                isPinned={false}
                onSelect={() => onSelectSession(room.id)}
                onDelete={() => onDeleteRoom(room.id)}
                onTogglePin={() => onTogglePin(room.id)}
              />
            ))}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-xs text-gray-400 dark:text-slate-500">
            {search ? "該当なし" : "チャット履歴はまだありません"}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-gray-200 dark:border-slate-700 flex items-center gap-2">
        <button
          onClick={onOpenSettings}
          className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-800 text-gray-500 dark:text-slate-400 transition-colors duration-150"
          title="設定"
        >
          <Settings size={16} />
        </button>
        <button
          onClick={onLogout}
          className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-800 text-gray-500 dark:text-slate-400 transition-colors duration-150"
          title="ログアウト"
        >
          <LogOut size={16} />
        </button>
      </div>
    </div>
  );
}

function ChatRoomItem({
  room,
  isActive,
  isPinned,
  onSelect,
  onDelete,
  onTogglePin,
}: {
  room: SessionSummary;
  isActive: boolean;
  isPinned: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
}) {
  return (
    <div
      className={`group w-full text-left px-4 py-2 flex items-center gap-2 transition-colors duration-150 ${
        isActive
          ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
          : "hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-gray-300"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 text-left text-xs truncate"
      >
        {room.name || "新しいチャット"}
      </button>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all duration-150">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin();
          }}
          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-400 dark:text-slate-500 hover:text-indigo-500 dark:hover:text-indigo-400 transition-all"
          title={isPinned ? "ピン解除" : "ピン留め"}
        >
          {isPinned ? <PinOff size={12} /> : <Pin size={12} />}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-all"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

function WorkFolderItem({
  label,
  subtitle,
  isActive,
  isLoading,
  onOpen,
  onPick,
}: {
  label: string;
  subtitle: string;
  isActive: boolean;
  isLoading: boolean;
  onOpen: () => void;
  onPick?: () => void;
}) {
  return (
    <div
      className={`group flex items-center gap-2 rounded-lg px-3 py-2 transition-colors duration-150 ${
        isActive
          ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
          : "bg-white text-gray-700 hover:bg-gray-100 dark:bg-slate-800 dark:text-gray-300 dark:hover:bg-slate-700"
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 text-left"
      >
        <div className="truncate text-xs font-medium">{label}</div>
        <div className="truncate text-[11px] text-gray-500 dark:text-slate-400">
          {subtitle}
        </div>
      </button>
      {onPick && (
        <button
          type="button"
          onClick={onPick}
          className="shrink-0 rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-600 transition-colors hover:bg-gray-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          {isLoading ? "..." : "選ぶ"}
        </button>
      )}
    </div>
  );
}

function groupByDate(
  rooms: SessionSummary[],
): Record<string, SessionSummary[]> {
  const groups: Record<string, SessionSummary[]> = {};
  const now = new Date();
  const today = now.toDateString();
  const yesterday = new Date(now.getTime() - 86400000).toDateString();

  for (const room of rooms) {
    const date = new Date(room.created_at);
    const dateStr = date.toDateString();
    let label: string;
    if (dateStr === today) label = "今日";
    else if (dateStr === yesterday) label = "昨日";
    else label = `${date.getMonth() + 1}/${date.getDate()}`;

    if (!groups[label]) groups[label] = [];
    groups[label].push(room);
  }
  return groups;
}
