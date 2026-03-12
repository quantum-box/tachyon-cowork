import { useCallback, useMemo, useState } from "react";
import { AgentChatClient } from "./lib/api-client";
import { type AuthState, clearAuth, loadAuth } from "./lib/auth";
import { useAgentChat } from "./hooks/useAgentChat";
import { useFileHandler } from "./hooks/useFileHandler";
import { useArtifact } from "./hooks/useArtifact";
import { Sidebar } from "./components/layout/Sidebar";
import { ChatPanel } from "./components/chat/ChatPanel";
import { ArtifactPanel } from "./components/artifact/ArtifactPanel";
import { LoginScreen } from "./components/layout/LoginScreen";
import { ToolsPanel } from "./components/layout/ToolsPanel";

export default function App() {
  const [auth, setAuth] = useState<AuthState | null>(loadAuth);
  const [showTools, setShowTools] = useState(false);

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
  const fileHandler = useFileHandler();
  const artifactState = useArtifact();

  const handleLogout = useCallback(() => {
    clearAuth();
    setAuth(null);
  }, []);

  const handleOpenArtifact = useCallback(
    (artifact: Parameters<typeof artifactState.openArtifact>[0]) => {
      artifactState.addArtifact(artifact);
      artifactState.openArtifact(artifact);
    },
    [artifactState],
  );

  const handleToggleTools = useCallback(() => {
    setShowTools((prev) => !prev);
  }, []);

  const handleBackToChat = useCallback(() => {
    setShowTools(false);
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
          onToggleTools={handleToggleTools}
          showTools={showTools}
        />
      </div>

      {/* Main area */}
      <div className="flex-1 min-w-0">
        {showTools ? (
          <ToolsPanel onBack={handleBackToChat} />
        ) : (
          <ChatPanel
            chat={chat}
            files={fileHandler.files}
            fileError={fileHandler.fileError}
            onFilesAdd={fileHandler.addFiles}
            onFileRemove={fileHandler.removeFile}
            onClearFiles={fileHandler.clearFiles}
            onOpenArtifact={handleOpenArtifact}
          />
        )}
      </div>

      {/* Artifact panel (right side) */}
      <ArtifactPanel
        artifact={artifactState.selectedArtifact}
        isOpen={artifactState.isPanelOpen}
        onClose={artifactState.closePanel}
        onDownload={artifactState.downloadArtifact}
      />
    </div>
  );
}
