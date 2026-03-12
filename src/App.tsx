import { useCallback, useMemo, useState } from "react";
import { AgentChatClient } from "./lib/api-client";
import { type AuthState, clearAuth, loadAuth } from "./lib/auth";
import { useAgentChat } from "./hooks/useAgentChat";
import { Sidebar } from "./components/layout/Sidebar";
import { ChatPanel } from "./components/chat/ChatPanel";
import { LoginScreen } from "./components/layout/LoginScreen";

export default function App() {
  const [auth, setAuth] = useState<AuthState | null>(loadAuth);

  const client = useMemo(
    () =>
      auth
        ? new AgentChatClient({
            apiBaseUrl: auth.apiBaseUrl,
            accessToken: auth.accessToken,
            tenantId: auth.tenantId,
            userId: auth.userId,
          })
        : null,
    [auth],
  );

  const chat = useAgentChat(client);

  const handleLogout = useCallback(() => {
    clearAuth();
    setAuth(null);
  }, []);

  if (!auth) {
    return <LoginScreen onLogin={setAuth} />;
  }

  return (
    <div className="flex h-screen bg-white">
      {/* Sidebar: 260px fixed */}
      <div className="w-[260px] shrink-0">
        <Sidebar
          chatRooms={chat.chatRooms}
          activeSessionId={chat.sessionId}
          onNewChat={chat.newChat}
          onSelectSession={chat.selectSession}
          onDeleteRoom={chat.deleteRoom}
          onLogout={handleLogout}
        />
      </div>

      {/* Main chat area */}
      <div className="flex-1 min-w-0">
        <ChatPanel chat={chat} />
      </div>
    </div>
  );
}
