import { useState } from "react";
import {
  MessageSquarePlus,
  Search,
  Trash2,
  Settings,
  LogOut,
} from "lucide-react";
import type { ChatRoom } from "../../lib/types";

type Props = {
  chatRooms: ChatRoom[];
  activeSessionId: string | null;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onDeleteRoom: (id: string) => void;
  onLogout: () => void;
};

export function Sidebar({
  chatRooms,
  activeSessionId,
  onNewChat,
  onSelectSession,
  onDeleteRoom,
  onLogout,
}: Props) {
  const [search, setSearch] = useState("");

  const filtered = search
    ? chatRooms.filter((r) =>
        r.name.toLowerCase().includes(search.toLowerCase()),
      )
    : chatRooms;

  // Group by date
  const grouped = groupByDate(filtered);

  return (
    <div className="flex flex-col h-full bg-gray-50 border-r border-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-sm font-semibold text-gray-800 tracking-tight">
            Tachyon Cowork
          </h1>
          <button
            onClick={onNewChat}
            className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-600 transition-colors"
            title="新しいチャット"
          >
            <MessageSquarePlus size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="検索..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-gray-200 bg-white outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/20 placeholder:text-gray-400"
          />
        </div>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto py-2">
        {Object.entries(grouped).map(([label, rooms]) => (
          <div key={label}>
            <div className="px-4 py-1.5 text-[10px] font-medium text-gray-400 uppercase tracking-wider">
              {label}
            </div>
            {rooms.map((room) => (
              <ChatRoomItem
                key={room.id}
                room={room}
                isActive={room.id === activeSessionId}
                onSelect={() => onSelectSession(room.id)}
                onDelete={() => onDeleteRoom(room.id)}
              />
            ))}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-xs text-gray-400">
            {search ? "該当なし" : "チャット履歴はまだありません"}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-gray-200 flex items-center gap-2">
        <button className="p-2 rounded-lg hover:bg-gray-200 text-gray-500 transition-colors">
          <Settings size={16} />
        </button>
        <button
          onClick={onLogout}
          className="p-2 rounded-lg hover:bg-gray-200 text-gray-500 transition-colors"
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
  onSelect,
  onDelete,
}: {
  room: ChatRoom;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`group w-full text-left px-4 py-2 flex items-center gap-2 transition-colors ${
        isActive
          ? "bg-indigo-50 text-indigo-700"
          : "hover:bg-gray-100 text-gray-700"
      }`}
    >
      <span className="flex-1 text-xs truncate">{room.name || "新しいチャット"}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-red-500 transition-all"
      >
        <Trash2 size={12} />
      </button>
    </button>
  );
}

function groupByDate(rooms: ChatRoom[]): Record<string, ChatRoom[]> {
  const groups: Record<string, ChatRoom[]> = {};
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
