import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgentChatClient } from "./lib/api-client";
import {
  type AuthState,
  buildAuthState,
  clearAuth,
  loadAuth,
  saveAuth,
} from "./lib/auth";
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
import { useSendKey } from "./hooks/useSendKey";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useMcpTools } from "./hooks/useMcpTools";
import { useProjectState } from "./hooks/useProjectState";
import { useProjectContext } from "./hooks/useProjectContext";
import { Sidebar } from "./components/layout/Sidebar";
import { ChatPanel } from "./components/chat/ChatPanel";
import { ArtifactPanel } from "./components/artifact/ArtifactPanel";
import { CanvasView } from "./components/canvas/CanvasView";
import { LoginScreen } from "./components/layout/LoginScreen";
import { ToolsPanel } from "./components/layout/ToolsPanel";
import { SettingsPanel } from "./components/layout/SettingsPanel";
import { WorkFolderListPanel } from "./components/layout/WorkFolderListPanel";
import { WorkFolderPanel } from "./components/layout/WorkFolderPanel";
import type { SessionSummary } from "./lib/types";
import {
  isTauri,
  type ProjectContext,
  type ProjectEntry,
} from "./lib/tauri-bridge";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";

export default function App() {
  const [auth, setAuth] = useState<AuthState | null>(loadAuth);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [isExchangingToken, setIsExchangingToken] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  const { theme, setTheme } = useTheme();
  const { sendKey, setSendKey } = useSendKey();
  const navigate = useNavigate();
  const location = useLocation();
  const showTools = location.pathname === "/tools";
  const showWorkFolders = location.pathname.startsWith("/work-folders");

  useEffect(() => {
    const syncNetworkState = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", syncNetworkState);
    window.addEventListener("offline", syncNetworkState);
    return () => {
      window.removeEventListener("online", syncNetworkState);
      window.removeEventListener("offline", syncNetworkState);
    };
  }, []);

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
          apiBaseUrl:
            import.meta.env.VITE_API_BASE_URL ?? "https://api.n1.tachy.one",
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
        setOauthError(
          err instanceof Error ? err.message : "Token exchange failed",
        );
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

  useEffect(() => {
    artifactState.closeCanvas();
    artifactState.closePanel();
  }, [location.pathname, artifactState]);

  const {
    activeProject,
    recentProjects,
    activateProject,
    removeProject,
    isLoading: isProjectLoading,
  } = useProjectState();
  const {
    context: projectContext,
    isLoading: isProjectContextLoading,
    isInitializing: isProjectInitializing,
    error: projectContextError,
    saveSummary: saveProjectSummary,
  } = useProjectContext(activeProject?.path);
  const { mcpTools, refreshMcpTools } = useMcpTools(activeProject?.path);

  const handleArtifactFromSSE = useCallback(
    (artifact: Parameters<typeof artifactState.addArtifact>[0]) => {
      artifactState.addArtifact(artifact);
      artifactState.openArtifact(artifact);
    },
    [artifactState],
  );

  const handleCanvasToolCall = useCallback(
    (args: {
      title: string;
      content: string;
      content_type: "html" | "jsx";
    }) => {
      artifactState.openCanvas(args.title, args.content, args.content_type);
    },
    [artifactState],
  );

  const chat = useAgentChat(
    client,
    handleArtifactFromSSE,
    handleCanvasToolCall,
    mcpTools,
    activeProject?.path,
    projectContext,
  );

  const handleLogout = useCallback(() => {
    tokenManagerRef.current?.dispose();
    tokenManagerRef.current = null;
    clearAuth();
    setAuth(null);
  }, []);

  const handleLogin = useCallback((newAuth: AuthState) => {
    saveAuth(newAuth);
    setAuth(newAuth);
    setOfflineMode(false);
  }, []);

  const handleOpenArtifact = useCallback(
    (artifact: Parameters<typeof artifactState.openArtifact>[0]) => {
      artifactState.addArtifact(artifact);
      artifactState.openArtifact(artifact);
    },
    [artifactState],
  );

  const handleToggleTools = useCallback(() => {
    navigate(showTools ? "/" : "/tools");
  }, [navigate, showTools]);

  const openWorkFolderPage = useCallback(
    (path?: string | null) => {
      if (path) {
        navigate(`/work-folders/${encodeURIComponent(path)}`);
        return;
      }
      navigate("/work-folders");
    },
    [navigate],
  );

  const handleBackToChat = useCallback(() => {
    navigate("/");
  }, [navigate]);

  const handleStartChatFromWorkFolder = useCallback(() => {
    chat.newChat();
    artifactState.closeCanvas();
    navigate("/");
  }, [artifactState, chat, navigate]);

  const handleOpenSessionFromWorkFolder = useCallback(
    (sessionId: string) => {
      chat.selectSession(sessionId);
      artifactState.closeCanvas();
      navigate("/");
    },
    [artifactState, chat, navigate],
  );

  const handlePickProject = useCallback(async () => {
    if (!isTauri()) return;
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === "string") {
      await activateProject(selected);
      await refreshMcpTools();
      if (location.pathname.startsWith("/work-folders")) {
        openWorkFolderPage(selected);
      }
    }
  }, [activateProject, refreshMcpTools, location.pathname, openWorkFolderPage]);

  const handleSelectProject = useCallback(
    async (path: string) => {
      await activateProject(path);
      await refreshMcpTools();
    },
    [activateProject, refreshMcpTools],
  );

  const handleRemoveProject = useCallback(
    async (path: string) => {
      await removeProject(path);
      await refreshMcpTools();
    },
    [removeProject, refreshMcpTools],
  );

  const handleSaveProjectSummary = useCallback(
    async (summary: string) => {
      await saveProjectSummary(summary);
    },
    [saveProjectSummary],
  );

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
    if (offlineMode) {
      return (
        <div className="h-screen bg-white dark:bg-slate-950 transition-colors duration-150">
          <ToolsPanel
            onBack={() => setOfflineMode(false)}
            backLabel="サインインへ戻る"
            title="ローカルファイルツール"
            description="オフラインでも使える機能だけを表示しています"
          />
        </div>
      );
    }

    return (
      <LoginScreen
        onLogin={handleLogin}
        oauthError={oauthError}
        isExchangingToken={isExchangingToken}
        isOffline={!isOnline}
        onEnterOfflineMode={isTauri() ? () => setOfflineMode(true) : undefined}
      />
    );
  }

  // Auto-collapse sidebar on mobile
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false,
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
      if (e.matches) setSidebarCollapsed(true);
    };
    setIsMobile(mq.matches);
    if (mq.matches) setSidebarCollapsed(true);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Close sidebar on mobile when navigating
  const handleMobileSidebarClose = useCallback(() => {
    if (isMobile) setSidebarCollapsed(true);
  }, [isMobile]);

  return (
    <div className="flex h-screen bg-white dark:bg-slate-950 transition-colors duration-150">
      {/* Sidebar - overlay on mobile, inline on desktop */}
      {isMobile && !sidebarCollapsed && (
        <div
          className="fixed inset-0 bg-black/40 z-[60] transition-opacity duration-200"
          onClick={() => setSidebarCollapsed(true)}
        />
      )}
      <div
        className={`
          ${isMobile
            ? `fixed inset-y-0 left-0 z-[70] transition-transform duration-200 ${sidebarCollapsed ? "-translate-x-full" : "translate-x-0"} w-[280px]`
            : `shrink-0 ${sidebarCollapsed ? "w-12" : "w-[260px]"} transition-all duration-200`
          }
        `}
      >
        <Sidebar
          sessions={chat.sessions}
          activeSessionId={chat.sessionId}
          pinnedRooms={chat.pinnedRooms}
          onNewChat={() => {
            chat.newChat();
            artifactState.closeCanvas();
            navigate("/");
            handleMobileSidebarClose();
          }}
          onSelectSession={(id: string) => {
            chat.selectSession(id);
            artifactState.closeCanvas();
            navigate("/");
            handleMobileSidebarClose();
          }}
          onDeleteRoom={chat.deleteRoom}
          onTogglePin={chat.togglePin}
          onLogout={handleLogout}
          onToggleTools={isTauri() ? handleToggleTools : undefined}
          showTools={showTools}
          showWorkFolders={showWorkFolders}
          onOpenSettings={() => setSettingsOpen(true)}
          isCollapsed={isMobile ? false : sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
          activeProject={activeProject}
          recentProjects={recentProjects}
          onPickProject={isTauri() ? handlePickProject : undefined}
          onOpenWorkFolderList={(path) => {
            openWorkFolderPage(path);
            handleMobileSidebarClose();
          }}
          isProjectLoading={isProjectLoading}
        />
      </div>

      {/* Main area */}
      <div className="flex-1 min-w-0">
        <Routes>
          <Route
            path="/"
            element={
              <ChatPanel
                chat={chat}
                files={fileHandler.files}
                fileError={fileHandler.fileError}
                onFilesAdd={fileHandler.addFiles}
                onFileRemove={fileHandler.removeFile}
                onClearFiles={fileHandler.clearFiles}
                toInlineAttachments={fileHandler.toInlineAttachments}
                onPrepareMessage={fileHandler.prepareMessage}
                isPreparingFiles={fileHandler.isPreparing}
                onOpenArtifact={handleOpenArtifact}
                onOpenCanvas={artifactState.openCanvas}
                isSearchOpen={searchOpen}
                onSearchClose={() => setSearchOpen(false)}
                sendKey={sendKey}
                isOffline={!isOnline}
                onOpenTools={() => navigate("/tools")}
                projectContext={projectContext}
                onToggleSidebar={isMobile ? () => setSidebarCollapsed((prev) => !prev) : undefined}
              />
            }
          />
          {isTauri() && (
            <Route
              path="/tools"
              element={
                <ToolsPanel
                  onBack={handleBackToChat}
                  projectDirectory={activeProject?.path}
                />
              }
            />
          )}
          <Route
            path="/work-folders"
            element={
              <WorkFolderListPanel
                onBack={handleBackToChat}
                onPickProject={handlePickProject}
                recentProjects={recentProjects}
                activeProject={activeProject}
                isLoading={isProjectLoading}
                onOpenProject={openWorkFolderPage}
                onRemoveProject={handleRemoveProject}
              />
            }
          />
          <Route
            path="/work-folders/:folderPath"
            element={
              <WorkFolderRoute
                onBack={handleBackToChat}
                onStartChat={handleStartChatFromWorkFolder}
                onPickProject={handlePickProject}
                activeProject={activeProject}
                projectContext={projectContext}
                sessions={chat.sessions}
                isLoading={isProjectContextLoading}
                isSaving={isProjectInitializing}
                error={projectContextError}
                onSaveSummary={handleSaveProjectSummary}
                onActivateProject={handleSelectProject}
                onOpenSession={handleOpenSessionFromWorkFolder}
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
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
        onMcpConfigChanged={refreshMcpTools}
        sendKey={sendKey}
        onSendKeyChange={setSendKey}
      />
    </div>
  );
}

type WorkFolderRouteProps = {
  onBack: () => void;
  onStartChat: () => void;
  onPickProject: () => void;
  activeProject?: ProjectEntry | null;
  projectContext?: ProjectContext | null;
  sessions: SessionSummary[];
  isLoading: boolean;
  isSaving: boolean;
  error?: string | null;
  onSaveSummary: (summary: string) => void;
  onActivateProject: (path: string) => Promise<void>;
  onOpenSession: (sessionId: string) => void;
};

function WorkFolderRoute({
  activeProject,
  onActivateProject,
  ...props
}: WorkFolderRouteProps) {
  const { folderPath } = useParams();
  const decodedPath = useMemo(
    () => (folderPath ? decodeURIComponent(folderPath) : null),
    [folderPath],
  );
  const filteredSessions = useMemo(() => {
    if (!decodedPath) return [];
    return props.sessions.filter(
      (session) => session.project_path === decodedPath,
    );
  }, [decodedPath, props.sessions]);

  useEffect(() => {
    if (!decodedPath) return;
    if (activeProject?.path === decodedPath) return;
    onActivateProject(decodedPath);
  }, [decodedPath, activeProject?.path, onActivateProject]);

  return (
    <WorkFolderPanel
      {...props}
      activeProject={activeProject}
      sessions={filteredSessions}
    />
  );
}
