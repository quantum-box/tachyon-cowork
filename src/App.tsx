import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgentChatClient } from "./lib/api-client";
import { type AuthState, clearAuth, loadAuth, saveAuth } from "./lib/auth";
import { TokenManager } from "./lib/token-manager";
import { useAgentChat } from "./hooks/useAgentChat";
import { useFileHandler } from "./hooks/useFileHandler";
import { useArtifact } from "./hooks/useArtifact";
import { useTheme } from "./hooks/useTheme";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { Sidebar } from "./components/layout/Sidebar";
import { ChatPanel } from "./components/chat/ChatPanel";
import { ArtifactPanel } from "./components/artifact/ArtifactPanel";
import { LoginScreen } from "./components/layout/LoginScreen";
import { ToolsPanel } from "./components/layout/ToolsPanel";
import { SettingsPanel } from "./components/layout/SettingsPanel";

export default function App() {
  const [auth, setAuth] = useState<AuthState | null>(loadAuth);
  const [showTools, setShowTools] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const { theme, setTheme } = useTheme();

  // ── Token Manager ─────────────────────────────────────────────────
  const tokenManagerRef = useRef<TokenManager | null>(null);
  const clientRef = useRef<AgentChatClient | null>(null);

  const handleAuthError = useCallback(() => {
    tokenManagerRef.current?.dispose();
    tokenManagerRef.current = null;
    clearAuth();
    setAuth(null);
  }, []);

  const handleTokenRefreshed = useCallback((newAuth: AuthState) => {
    setAuth(newAuth);
    clientRef.current?.updateConfig({ accessToken: newAuth.accessToken });
  }, []);

  // Initialize / teardown TokenManager with auth lifecycle
  useEffect(() => {
    if (!auth) {
      tokenManagerRef.current?.dispose();
      tokenManagerRef.current = null;
      return;
    }

    if (tokenManagerRef.current) {
      tokenManagerRef.current.updateAuth(auth);
    } else {
      tokenManagerRef.current = new TokenManager(auth, {
        onTokenRefreshed: handleTokenRefreshed,
        onAuthError: handleAuthError,
      });
    }

    // Attach to existing client if available
    if (clientRef.current && tokenManagerRef.current) {
      clientRef.current.setTokenManager(tokenManagerRef.current);
    }

    return () => {
      tokenManagerRef.current?.dispose();
      tokenManagerRef.current = null;
    };
  }, [auth, handleAuthError, handleTokenRefreshed]);

  // ── API Client ────────────────────────────────────────────────────
  const client = useMemo(() => {
    if (!auth) {
      clientRef.current = null;
      return null;
    }
    const c = new AgentChatClient({
      apiBaseUrl: auth.apiBaseUrl,
      accessToken: auth.accessToken,
      tenantId: auth.tenantId,
      userId: auth.userId,
    });
    if (tokenManagerRef.current) {
      c.setTokenManager(tokenManagerRef.current);
    }
    clientRef.current = c;
    return c;
  }, [auth]);

  const fileHandler = useFileHandler();
  const artifactState = useArtifact();

  const handleArtifactFromSSE = useCallback(
    (artifact: Parameters<typeof artifactState.addArtifact>[0]) => {
      artifactState.addArtifact(artifact);
      artifactState.openArtifact(artifact);
    },
    [artifactState],
  );

  const chat = useAgentChat(client, handleArtifactFromSSE);

  const handleLogout = useCallback(() => {
    tokenManagerRef.current?.dispose();
    tokenManagerRef.current = null;
    clearAuth();
    setAuth(null);
  }, []);

  const handleLogin = useCallback((newAuth: AuthState) => {
    saveAuth(newAuth);
    setAuth(newAuth);
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

  // Keyboard shortcuts
  useKeyboardShortcuts(
    useMemo(
      () => ({
        onNewChat: () => {
          if (auth) chat.newChat();
        },
        onSearch: () => {
          if (auth) setSearchOpen((prev) => !prev);
        },
        onSettings: () => {
          // Escape closes settings or search
          if (settingsOpen) {
            setSettingsOpen(false);
          } else if (searchOpen) {
            setSearchOpen(false);
          }
        },
      }),
      [auth, chat, settingsOpen, searchOpen],
    ),
  );

  if (!auth) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="flex h-screen bg-white dark:bg-slate-950 transition-colors duration-150">
      {/* Sidebar: 260px fixed */}
      <div className="w-[260px] shrink-0">
        <Sidebar
          chatRooms={chat.chatRooms}
          activeSessionId={chat.sessionId}
          pinnedRooms={chat.pinnedRooms}
          onNewChat={chat.newChat}
          onSelectSession={chat.selectSession}
          onDeleteRoom={chat.deleteRoom}
          onTogglePin={chat.togglePin}
          onLogout={handleLogout}
          onToggleTools={handleToggleTools}
          showTools={showTools}
          onOpenSettings={() => setSettingsOpen(true)}
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
            toInlineAttachments={fileHandler.toInlineAttachments}
            onOpenArtifact={handleOpenArtifact}
            isSearchOpen={searchOpen}
            onSearchClose={() => setSearchOpen(false)}
          />
        )}
      </div>

      {/* Artifact panel (right side) */}
      <ArtifactPanel
        artifact={artifactState.selectedArtifact}
        isOpen={artifactState.isPanelOpen}
        onClose={artifactState.closePanel}
        onDownload={artifactState.downloadArtifact}
        onSwitchVersion={artifactState.switchVersion}
      />

      {/* Settings panel */}
      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={theme}
        onThemeChange={setTheme}
        selectedModel={chat.selectedModel}
        onModelChange={chat.setSelectedModel}
        onLogout={handleLogout}
        apiBaseUrl={auth.apiBaseUrl}
        tenantId={auth.tenantId}
      />
    </div>
  );
}
