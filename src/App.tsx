import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgentChatClient, isUnauthorizedApiError } from "./lib/api-client";
import {
  DEFAULT_API_BASE_URL,
  type AuthState,
  buildAuthState,
  clearAuth,
  isPlaceholderAuthState,
  loadAuth,
  normalizeApiBaseUrl,
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
import { useGlobalCustomInstructions } from "./hooks/useGlobalCustomInstructions";
import { Sidebar } from "./components/layout/Sidebar";
import { ChatPanel } from "./components/chat/ChatPanel";
import { ArtifactPanel } from "./components/artifact/ArtifactPanel";
import { CanvasView } from "./components/canvas/CanvasView";
import { LoginScreen } from "./components/layout/LoginScreen";
import { ToolsPanel } from "./components/layout/ToolsPanel";
import { SettingsPanel } from "./components/layout/SettingsPanel";
import { WorkFolderListPanel } from "./components/layout/WorkFolderListPanel";
import { WorkFolderPanel } from "./components/layout/WorkFolderPanel";
import type { ModelInfo, SessionSummary } from "./lib/types";
import {
  clearTauriRuntimeAuth,
  isTauri,
  isTauriMacOS,
  type ProjectContext,
  type ProjectEntry,
  setTauriRuntimeAuth,
} from "./lib/tauri-bridge";
import { hasModelOption, resolveModelOptions } from "./lib/models";
import { shouldEnableTestBridge, type TachyonTestBridge } from "./lib/test-bridge";
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
  const [availableModels, setAvailableModels] = useState<ModelInfo[] | null>(
    null,
  );
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  // Mobile detection (must be top-level, before any conditional returns)
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false,
  );

  const { theme, setTheme } = useTheme();
  const { sendKey, setSendKey } = useSendKey();
  const { globalCustomInstructions, setGlobalCustomInstructions } =
    useGlobalCustomInstructions();
  const navigate = useNavigate();
  const location = useLocation();
  const showTools = location.pathname === "/tools";
  const showWorkFolders = location.pathname.startsWith("/work-folders");
  const isMacDesktop = isTauriMacOS();
  const desktopShellClass =
    isMacDesktop && !isMobile
      ? "relative flex h-screen overflow-hidden pb-2 pr-2 pl-0 pt-1.5 md:pb-3 md:pr-3"
      : "relative flex h-screen overflow-hidden p-2 md:p-3";

  useEffect(() => {
    document.documentElement.classList.toggle("tauri-macos", isMacDesktop);
    return () => {
      document.documentElement.classList.remove("tauri-macos");
    };
  }, [isMacDesktop]);

  useEffect(() => {
    if (!auth || !isPlaceholderAuthState(auth)) return;
    clearAuth();
    setAuth(null);
  }, [auth]);

  useEffect(() => {
    if (!auth) return;

    const normalizedApiBaseUrl = normalizeApiBaseUrl(auth.apiBaseUrl);
    if (normalizedApiBaseUrl === auth.apiBaseUrl) return;

    const normalizedAuth = {
      ...auth,
      apiBaseUrl: normalizedApiBaseUrl,
    };
    saveAuth(normalizedAuth);
    setAuth(normalizedAuth);
  }, [auth]);

  useEffect(() => {
    const syncNetworkState = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", syncNetworkState);
    window.addEventListener("offline", syncNetworkState);
    return () => {
      window.removeEventListener("online", syncNetworkState);
      window.removeEventListener("offline", syncNetworkState);
    };
  }, []);

  // Auto-collapse sidebar on mobile
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
          apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL,
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

  useEffect(() => {
    if (!isTauri()) return;

    void (async () => {
      try {
        if (auth) {
          await setTauriRuntimeAuth(auth);
        } else {
          await clearTauriRuntimeAuth();
        }
      } catch (error) {
        console.warn("Failed to sync runtime auth to Tauri backend.", error);
      }
    })();
  }, [auth]);

  const fileHandler = useFileHandler();
  const artifactState = useArtifact();
  const { addArtifact, openArtifact, closePanel, closeCanvas, openCanvas } =
    artifactState;

  useEffect(() => {
    closeCanvas();
    closePanel();
  }, [location.pathname, closeCanvas, closePanel]);

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
    isSaving: isProjectContextSaving,
    error: projectContextError,
    saveCustomInstructions: saveProjectCustomInstructions,
  } = useProjectContext(activeProject?.path);
  const { mcpTools, refreshMcpTools } = useMcpTools(activeProject?.path);

  const handleArtifactFromSSE = useCallback(
    (artifact: Parameters<typeof addArtifact>[0]) => {
      addArtifact(artifact);
      openArtifact(artifact);
    },
    [addArtifact, openArtifact],
  );

  const handleCanvasToolCall = useCallback(
    (args: {
      title: string;
      content: string;
      content_type: "html" | "jsx";
    }) => {
      openCanvas(args.title, args.content, args.content_type);
    },
    [openCanvas],
  );

  const chat = useAgentChat(
    client,
    handleArtifactFromSSE,
    handleCanvasToolCall,
    mcpTools,
    globalCustomInstructions,
    activeProject?.path,
    projectContext,
  );
  const {
    chunks,
    clearError,
    isLoading: isChatLoading,
    newChat,
    selectedModel,
    sendMessage,
    sessionId,
    setSelectedModel,
    error: chatError,
  } = chat;
  const modelOptions = useMemo(
    () => resolveModelOptions(availableModels),
    [availableModels],
  );
  const hasSideSurface =
    artifactState.canvas.isOpen || artifactState.isPanelOpen;

  useEffect(() => {
    let cancelled = false;

    if (!client) {
      setAvailableModels(null);
      return;
    }

    client
      .getModels()
      .then((models) => {
        if (!cancelled) {
          setAvailableModels(models);
        }
      })
      .catch((error) => {
        if (isUnauthorizedApiError(error)) {
          return;
        }
        console.warn(
          "Failed to load available models, using fallback list.",
          error,
        );
        if (!cancelled) {
          setAvailableModels(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client]);

  useEffect(() => {
    if (!modelOptions.length) return;
    if (hasModelOption(modelOptions, chat.selectedModel)) return;
    chat.setSelectedModel(modelOptions[0].id);
  }, [modelOptions, chat.selectedModel, chat.setSelectedModel]);

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

  useEffect(() => {
    if (!shouldEnableTestBridge()) {
      delete window.__tachyonTestBridge;
      return;
    }

    const bridge: TachyonTestBridge = {
      version: "1",
      getState: () => ({
        auth,
        activeProject,
        recentProjects,
        projectContext,
        sessionId,
        chunks,
        isLoading: isChatLoading,
        error: chatError,
        selectedModel,
        availableModels,
        mcpToolNames: mcpTools.map((tool) => tool.name),
        pathname: location.pathname,
        canvasOpen: artifactState.canvas.isOpen,
        artifactPanelOpen: artifactState.isPanelOpen,
      }),
      setAuth: (nextAuth) => {
        if (nextAuth) {
          handleLogin(nextAuth);
          return;
        }
        handleLogout();
      },
      activateProject: async (path) => {
        await activateProject(path);
      },
      sendMessage: async (message, taskOverride) => {
        await sendMessage(message, undefined, taskOverride);
      },
      newChat: () => {
        newChat();
      },
      setSelectedModel: (modelId) => {
        setSelectedModel(modelId);
      },
      clearError: () => {
        clearError();
      },
    };

    window.__tachyonTestBridge = bridge;

    return () => {
      if (window.__tachyonTestBridge === bridge) {
        delete window.__tachyonTestBridge;
      }
    };
  }, [
    activateProject,
    activeProject,
    artifactState.canvas.isOpen,
    artifactState.isPanelOpen,
    auth,
    availableModels,
    chatError,
    chunks,
    clearError,
    handleLogin,
    handleLogout,
    isChatLoading,
    location.pathname,
    mcpTools,
    newChat,
    projectContext,
    recentProjects,
    selectedModel,
    sendMessage,
    sessionId,
    setSelectedModel,
  ]);

  const handleOpenArtifact = useCallback(
    (artifact: Parameters<typeof openArtifact>[0]) => {
      addArtifact(artifact);
      openArtifact(artifact);
    },
    [addArtifact, openArtifact],
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
    closeCanvas();
    navigate("/");
  }, [chat, closeCanvas, navigate]);

  const handleOpenSessionFromWorkFolder = useCallback(
    (sessionId: string) => {
      chat.selectSession(sessionId);
      closeCanvas();
      navigate("/");
    },
    [chat, closeCanvas, navigate],
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

  const handleSidebarProjectSwitch = useCallback(
    async (path: string) => {
      await handleSelectProject(path);
      if (location.pathname.startsWith("/work-folders")) {
        openWorkFolderPage(path);
      }
      if (isMobile) {
        setSidebarCollapsed(true);
      }
    },
    [handleSelectProject, location.pathname, openWorkFolderPage, isMobile],
  );

  const handleRemoveProject = useCallback(
    async (path: string) => {
      await removeProject(path);
      await refreshMcpTools();
    },
    [removeProject, refreshMcpTools],
  );

  const handleSaveProjectCustomInstructions = useCallback(
    async (customInstructions: string) => {
      await saveProjectCustomInstructions(customInstructions);
    },
    [saveProjectCustomInstructions],
  );

  // Close sidebar on mobile when navigating
  const handleMobileSidebarClose = useCallback(() => {
    if (isMobile) setSidebarCollapsed(true);
  }, [isMobile]);

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
        <div className="h-screen p-3 md:p-4">
          <div className="surface-panel h-full overflow-hidden rounded-[28px]">
            <ToolsPanel
              onBack={() => setOfflineMode(false)}
              backLabel="サインインへ戻る"
              title="ローカルファイルツール"
              description="オフラインでも使える機能だけを表示しています"
            />
          </div>
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

  return (
    <div className={desktopShellClass}>
      {/* Sidebar - overlay on mobile, inline on desktop */}
      {isMobile && !sidebarCollapsed && (
        <div
          className="fixed inset-0 bg-black/40 z-[60] transition-opacity duration-200"
          onClick={() => setSidebarCollapsed(true)}
        />
      )}
      <div
        className={`
          ${
            isMobile
              ? `fixed inset-y-3 left-3 z-[70] transition-transform duration-200 ${sidebarCollapsed ? "-translate-x-full" : "translate-x-0"} w-[292px] overflow-hidden rounded-[28px] surface-panel`
              : `shrink-0 ${sidebarCollapsed ? (isMacDesktop ? "w-[76px]" : "w-14") : "w-[286px]"} transition-all duration-200 overflow-hidden`
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
          onSwitchProject={handleSidebarProjectSwitch}
          onOpenWorkFolderList={(path) => {
            openWorkFolderPage(path);
            handleMobileSidebarClose();
          }}
          isProjectLoading={isProjectLoading}
        />
      </div>

      {/* Main area */}
      <div
        className={`flex h-full flex-1 min-w-0 ${isMobile ? "" : "pl-1.5"} ${hasSideSurface ? "gap-2" : ""}`}
      >
        <div
          className={`flex-1 min-w-0 overflow-hidden ${isMobile ? "" : "workspace-card rounded-[28px]"}`}
        >
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
                  onToggleSidebar={
                    isMobile
                      ? () => setSidebarCollapsed((prev) => !prev)
                      : undefined
                  }
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
                  isSaving={isProjectContextSaving}
                  error={projectContextError}
                  onSaveCustomInstructions={
                    handleSaveProjectCustomInstructions
                  }
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
      </div>

      {/* Settings panel */}
      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={theme}
        onThemeChange={setTheme}
        selectedModel={chat.selectedModel}
        modelOptions={modelOptions}
        onModelChange={chat.setSelectedModel}
        onLogout={handleLogout}
        apiBaseUrl={auth.apiBaseUrl}
        tenantId={auth.tenantId}
        onMcpConfigChanged={refreshMcpTools}
        sendKey={sendKey}
        onSendKeyChange={setSendKey}
        globalCustomInstructions={globalCustomInstructions}
        onGlobalCustomInstructionsChange={setGlobalCustomInstructions}
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
  onSaveCustomInstructions: (customInstructions: string) => void;
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
