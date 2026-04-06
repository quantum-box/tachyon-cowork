import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgentChatClient } from "./lib/api-client";
import { type AuthState, buildAuthState, clearAuth, loadAuth, saveAuth } from "./lib/auth";
import { TokenManager } from "./lib/token-manager";
import {
  exchangeCodeForTokens,
  getCallbackCode,
  getCallbackError,
  getOAuth2Config,
} from "./lib/oauth2";
import { decodeJwtPayload } from "./lib/jwt";
import { useAgentChat } from "./hooks/useAgentChat";
import { useFileHandler } from "./hooks/useFileHandler";
import { useArtifact } from "./hooks/useArtifact";
import { useTheme } from "./hooks/useTheme";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { Sidebar } from "./components/layout/Sidebar";
import { ChatPanel } from "./components/chat/ChatPanel";
import { ArtifactPanel } from "./components/artifact/ArtifactPanel";
import { CanvasView } from "./components/canvas/CanvasView";
import { LoginScreen } from "./components/layout/LoginScreen";
import { ToolsPanel } from "./components/layout/ToolsPanel";
import { SettingsPanel } from "./components/layout/SettingsPanel";

export default function App() {
  const [auth, setAuth] = useState<AuthState | null>(loadAuth);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [isExchangingToken, setIsExchangingToken] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const { theme, setTheme } = useTheme();

  // ── OAuth2 Callback Handler ──────────────────────────────────────
  useEffect(() => {
    const error = getCallbackError();
    if (error) {
      setOauthError(error);
      window.history.replaceState({}, "", "/");
      return;
    }

    const code = getCallbackCode();
    if (!code) return;

    // Clear the URL immediately to avoid re-processing
    window.history.replaceState({}, "", "/");
    setIsExchangingToken(true);

    exchangeCodeForTokens(code)
      .then((tokens) => {
        const config = getOAuth2Config();
        const payload = decodeJwtPayload(tokens.access_token);
        const newAuth = buildAuthState({
          apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "https://api.n1.tachy.one",
          accessToken: tokens.access_token,
          tenantId: import.meta.env.VITE_DEFAULT_TENANT_ID ?? "",
          userId: payload?.sub,
          refreshToken: tokens.refresh_token,
          clientId: config.clientId,
        });
        saveAuth(newAuth);
        setAuth(newAuth);
      })
      .catch((err) => {
        console.error("OAuth2 token exchange failed:", err);
        setOauthError(err instanceof Error ? err.message : "Token exchange failed");
      })
      .finally(() => {
        setIsExchangingToken(false);
      });
  }, []);

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

  const handleCanvasToolCall = useCallback(
    (args: { title: string; content: string; content_type: "html" | "jsx" }) => {
      artifactState.openCanvas(args.title, args.content, args.content_type);
    },
    [artifactState],
  );

  const chat = useAgentChat(client, handleArtifactFromSSE, handleCanvasToolCall);

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
          if (auth) {
            chat.newChat();
            artifactState.closeCanvas();
          }
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
      [auth, chat, artifactState.closeCanvas, settingsOpen, searchOpen],
    ),
  );

  if (!auth) {
    return (
      <LoginScreen
        onLogin={handleLogin}
        oauthError={oauthError}
        isExchangingToken={isExchangingToken}
      />
    );
  }

  return (
    <div className="flex h-screen bg-white dark:bg-slate-950 transition-colors duration-150">
      {/* Sidebar */}
      <div className={`shrink-0 ${sidebarCollapsed ? "w-12" : "w-[260px]"} transition-all duration-200`}>
        <Sidebar
          sessions={chat.sessions}
          activeSessionId={chat.sessionId}
          pinnedRooms={chat.pinnedRooms}
          onNewChat={() => { chat.newChat(); artifactState.closeCanvas(); }}
          onSelectSession={(id: string) => { chat.selectSession(id); artifactState.closeCanvas(); }}
          onDeleteRoom={chat.deleteRoom}
          onTogglePin={chat.togglePin}
          onLogout={handleLogout}
          onToggleTools={handleToggleTools}
          showTools={showTools}
          onOpenSettings={() => setSettingsOpen(true)}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
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
            onOpenCanvas={artifactState.openCanvas}
            isSearchOpen={searchOpen}
            onSearchClose={() => setSearchOpen(false)}
          />
        )}
      </div>

      {/* Canvas panel (right side) - takes priority over artifact panel */}
      {artifactState.canvas.isOpen ? (
        <CanvasView
          title={artifactState.canvas.title}
          content={artifactState.canvas.content}
          contentType={artifactState.canvas.contentType}
          onClose={artifactState.closeCanvas}
        />
      ) : (
        <ArtifactPanel
          artifact={artifactState.selectedArtifact}
          isOpen={artifactState.isPanelOpen}
          onClose={artifactState.closePanel}
          onDownload={artifactState.downloadArtifact}
          onSwitchVersion={artifactState.switchVersion}
          onOpenCanvas={artifactState.openCanvas}
        />
      )}

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
