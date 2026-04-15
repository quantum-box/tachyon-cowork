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
  MessageCircle,
} from "lucide-react";
import type { SessionSummary } from "../../lib/types";
import {
  isTauri,
  isTauriMacOS,
  type ProjectEntry,
} from "../../lib/tauri-bridge";
import { UpdateChecker } from "./UpdateChecker";

const FEEDBACK_URL =
  "https://github.com/quantum-box/tachyon-cowork/issues/new?labels=feedback&template=feedback.md&title=%5BFeedback%5D+";

async function openFeedbackUrl() {
  const url = FEEDBACK_URL;
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(url);
  } else {
    window.open(url, "_blank");
  }
}

type Props = {
  sessions: SessionSummary[];
  activeSessionId: string | null;
  pinnedRooms: string[];
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onDeleteRoom: (id: string) => void;
  onTogglePin: (id: string) => void;
  onLogout: () => void;
  onToggleTools?: () => void;
  showTools: boolean;
  showWorkFolders: boolean;
  onOpenSettings: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  activeProject?: ProjectEntry | null;
  recentProjects: ProjectEntry[];
  onPickProject?: () => void;
  onOpenWorkFolderList: (path?: string) => void;
  onSwitchProject?: (path: string) => void;
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
  onSwitchProject,
  isProjectLoading = false,
}: Props) {
  const isMacDesktop = isTauriMacOS();
  const [search, setSearch] = useState("");
  const workFolderList =
    recentProjects.length > 0
      ? recentProjects.slice(0, 3)
      : activeProject
        ? [activeProject]
        : [];

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
      <div
        className={`flex h-full flex-col items-center gap-2 bg-transparent py-3 ${
          isMacDesktop ? "w-[76px]" : "w-14"
        }`}
      >
        <div className="window-drag-strip w-full" data-tauri-drag-region />
        <button
          onClick={onToggleCollapse}
          className="notion-icon-button p-2"
          title="サイドバーを開く"
        >
          <PanelLeftOpen size={18} />
        </button>
        <button
          onClick={onNewChat}
          className="notion-icon-button p-2"
          title="新しいチャット"
        >
          <MessageSquarePlus size={18} />
        </button>
        <div className="flex-1" />
        <button
          onClick={openFeedbackUrl}
          className="notion-icon-button p-2"
          title="フィードバック"
        >
          <MessageCircle size={16} />
        </button>
        <button
          onClick={onOpenSettings}
          className="notion-icon-button p-2"
          title="設定"
        >
          <Settings size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-transparent transition-colors duration-150">
      <div className="window-drag-strip w-full" data-tauri-drag-region />
      {/* Header */}
      <div className="border-b border-stone-200/80 px-3 pb-3 pt-4 dark:border-stone-800/80">
        <div className="titlebar-safe-header mb-2.5 flex items-center justify-between">
          <div className="titlebar-safe-start" data-tauri-drag-region>
            <h1 className="text-[13px] font-semibold tracking-[0.01em] text-stone-800 dark:text-stone-100">
              Tachyon Cowork
            </h1>
          </div>
          <div className="flex items-center gap-0.5">
            {onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                className="notion-icon-button p-2"
                title="サイドバーを閉じる"
              >
                <PanelLeftClose size={18} />
              </button>
            )}
            <button
              onClick={onNewChat}
              className="notion-icon-button p-2"
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
            className="notion-input w-full rounded-2xl py-2 pl-9 pr-3 text-xs placeholder:text-stone-400 dark:placeholder:text-stone-500"
          />
        </div>

        <div className="mt-2.5">
          <div className="flex items-center justify-between px-1 pb-0.5">
            <div className="notion-label">作業ディレクトリ一覧</div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => onOpenWorkFolderList()}
                className={`rounded-md px-1.5 py-1 text-[11px] transition-colors ${
                  showWorkFolders
                    ? "text-stone-900 dark:text-stone-100"
                    : "text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
                }`}
              >
                一覧
              </button>
              {!activeProject && onPickProject && (
                <button
                  type="button"
                  onClick={onPickProject}
                  className="rounded-md px-1.5 py-1 text-[11px] text-stone-500 transition-colors hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
                >
                  {isProjectLoading ? "..." : "開く"}
                </button>
              )}
            </div>
          </div>

          {workFolderList.length > 0 ? (
            <div className="mt-1.5 space-y-0.5">
              {workFolderList.map((project) => {
                const isCurrent = activeProject?.path === project.path;
                return (
                  <button
                    key={project.path}
                    type="button"
                    onClick={() =>
                      isCurrent
                        ? onOpenWorkFolderList(project.path)
                        : onSwitchProject
                          ? onSwitchProject(project.path)
                          : onOpenWorkFolderList(project.path)
                    }
                    className={`w-full border-l px-3 py-1.5 text-left transition-colors ${
                      isCurrent
                        ? "border-stone-400 text-stone-900 dark:border-stone-500 dark:text-stone-100"
                        : "border-transparent text-stone-500 hover:border-stone-200 hover:text-stone-800 dark:text-stone-400 dark:hover:border-stone-800 dark:hover:text-stone-200"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1 truncate text-xs font-medium">
                        {project.name}
                      </div>
                      {isCurrent && (
                        <span className="shrink-0 text-[10px] text-stone-400 dark:text-stone-500">
                          使用中
                        </span>
                      )}
                    </div>
                    <div className="truncate pt-0.5 text-[11px] text-stone-400 dark:text-stone-500">
                      {project.path}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <button
              type="button"
              onClick={onPickProject ?? (() => onOpenWorkFolderList())}
              className="mt-1.5 w-full border-l border-transparent px-3 py-1.5 text-left text-stone-500 transition-colors hover:border-stone-200 hover:text-stone-900 dark:text-stone-400 dark:hover:border-stone-800 dark:hover:text-stone-100"
            >
              <div className="truncate text-xs font-medium">
                作業ディレクトリを選ぶ
              </div>
              <div className="truncate pt-0.5 text-[11px] text-stone-400 dark:text-stone-500">
                未選択でもチャットは開始できます
              </div>
            </button>
          )}
        </div>
      </div>

      {/* File Tools button */}
      {onToggleTools && (
        <div className="px-3 pt-2.5">
          <button
            onClick={onToggleTools}
            className={`w-full flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-medium transition-colors ${
              showTools
                ? "border-stone-300 bg-white/95 text-stone-900 shadow-[0_8px_18px_rgba(15,23,42,0.06)] dark:border-stone-700 dark:bg-stone-900/90 dark:text-stone-100"
                : "border-stone-200 bg-white/70 text-stone-600 hover:bg-white/90 dark:border-stone-800 dark:bg-stone-900/50 dark:text-stone-300 dark:hover:bg-stone-900/80"
            }`}
          >
            <FolderOpen size={14} />
            ファイルツール
          </button>
        </div>
      )}

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto py-2">
        {/* Pinned section */}
        {pinned.length > 0 && (
          <div>
            <div className="notion-label flex items-center gap-1 px-4 py-1.5">
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
            <div className="notion-label px-4 py-1.5">{label}</div>
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
          <div className="px-4 py-8 text-center text-xs text-stone-400 dark:text-stone-500">
            {search ? "該当なし" : "チャット履歴はまだありません"}
          </div>
        )}
      </div>

      {/* Update notification */}
      <UpdateChecker />

      {/* Footer */}
      <div className="flex items-center gap-2 border-t border-stone-200/80 p-3 dark:border-stone-800/80">
        <button
          onClick={openFeedbackUrl}
          className="notion-icon-button p-2"
          title="フィードバック"
        >
          <MessageCircle size={16} />
        </button>
        <button
          onClick={onOpenSettings}
          className="notion-icon-button p-2"
          title="設定"
        >
          <Settings size={16} />
        </button>
        <button
          onClick={onLogout}
          className="notion-icon-button p-2"
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
      className={`group mx-2 flex w-auto items-center gap-2 rounded-2xl px-3 py-2 transition-colors duration-150 ${
        isActive
          ? "bg-white/95 text-stone-900 shadow-[0_8px_18px_rgba(15,23,42,0.06)] ring-1 ring-stone-200 dark:bg-stone-900/90 dark:text-stone-100 dark:ring-stone-700"
          : "text-stone-600 hover:bg-white/70 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-900/70 dark:hover:text-stone-100"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 text-left text-xs font-medium truncate"
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
          className="rounded-md p-1 text-stone-400 transition-all hover:bg-stone-200/70 hover:text-stone-700 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-200"
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
          className="rounded-md p-1 text-stone-400 transition-all hover:bg-red-50 hover:text-red-500 dark:text-stone-500 dark:hover:bg-red-950/40 dark:hover:text-red-400"
        >
          <Trash2 size={12} />
        </button>
      </div>
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
