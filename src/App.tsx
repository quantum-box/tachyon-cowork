import {
  type TouchEvent as ReactTouchEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AgentChatClient, isUnauthorizedApiError } from "./lib/api-client";
import {
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
import {
  getConfiguredApiBaseUrl,
  getConfiguredDefaultTenantId,
} from "./lib/auth-config";
import { decodeJwtPayload } from "./lib/jwt";
import { useAgentChat } from "./hooks/useAgentChat";
import { useFileHandler } from "./hooks/useFileHandler";
import { useArtifact } from "./hooks/useArtifact";
import { useTheme } from "./hooks/useTheme";
import { useSendKey } from "./hooks/useSendKey";
import { useRealtimeVoiceSettings } from "./hooks/useRealtimeVoiceSettings";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useMcpTools } from "./hooks/useMcpTools";
import { useProjectState } from "./hooks/useProjectState";
import { useProjectContext } from "./hooks/useProjectContext";
import { useGlobalCustomInstructions } from "./hooks/useGlobalCustomInstructions";
import { useMaxRequests } from "./hooks/useMaxRequests";
import {
  buildRealtimeAgentChatContext,
  playRealtimeCue,
  useRealtimeVoice,
} from "./hooks/useRealtimeVoice";
import { Sidebar } from "./components/layout/Sidebar";
import { ChatPanel } from "./components/chat/ChatPanel";
import { FloatingVoiceInput } from "./components/chat/FloatingVoiceInput";
import { ArtifactPanel } from "./components/artifact/ArtifactPanel";
import { CanvasView } from "./components/canvas/CanvasView";
import { LoginScreen } from "./components/layout/LoginScreen";
import { ToolsPanel } from "./components/layout/ToolsPanel";
import { SettingsPage } from "./components/layout/SettingsPage";
import { WorkFolderListPanel } from "./components/layout/WorkFolderListPanel";
import { WorkFolderPanel } from "./components/layout/WorkFolderPanel";
import { HelpPanel } from "./components/layout/HelpPanel";
import type { ModelInfo, SessionSummary } from "./lib/types";
import {
  clearTauriRuntimeAuth,
  hideCurrentTauriWindow,
  insertTextToFocusedApp,
  isTauri,
  isTauriDesktop,
  isTauriMacOS,
  listenFloatingVoiceStart,
  listenVoiceDotNewChat,
  listenVoiceDotOpenSettings,
  openAndStartFloatingVoiceInput,
  openFloatingVoiceInputWindow,
  pressCmdEnterToFocusedApp,
  registerFloatingVoiceShortcut,
  setVoiceDotMenuBarIconVisible,
  type ProjectContext,
  type ProjectEntry,
  setTauriRuntimeAuth,
} from "./lib/tauri-bridge";
import { hasModelOption, resolveModelOptions } from "./lib/models";
import {
  shouldEnableTestBridge,
  type TachyonTestBridge,
} from "./lib/test-bridge";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";

const MOBILE_DRAWER_EDGE_SWIPE_ZONE_PX = 36;
const MOBILE_DRAWER_CLOSE_SWIPE_ZONE_PX = 280;
const MOBILE_DRAWER_SWIPE_DISTANCE_PX = 56;
const MOBILE_DRAWER_SWIPE_MAX_VERTICAL_PX = 80;
const MOBILE_DRAWER_SWIPE_DOMINANCE_RATIO = 1.2;
const FLOATING_VOICE_INPUT_INSTRUCTIONS = [
  "You are a voice-driven text input assistant for the previously focused macOS form field.",
  "Always speak, transcribe, draft, revise, and submit in Japanese unless the user explicitly asks for another language.",
  "By default, keep spoken replies brief: use a short acknowledgement or one concise sentence. Only give longer, conversational answers when the user is asking for consultation, brainstorming, or help thinking through something.",
  "Use set_agent_chat_draft and update_agent_chat_draft to maintain the exact text that should be inserted into the form.",
  "Use submit_agent_chat_draft when the user asks to input, insert, paste, or commit the dictated text.",
  "Use submit_focused_form to press Cmd+Enter in the target form only after the user explicitly permits sending or submitting. Never submit automatically after inserting text; ask for permission first if it is unclear.",
  "After submit_agent_chat_draft, keep listening for the next user request. Do not stop or hide Voice Dot unless the user explicitly asks to close it.",
  "Use stop_realtime_voice when the user asks to stop, close, hide, end Voice Dot, or says they are done.",
  "Do not describe Agent chat. In this mode, submit_agent_chat_draft inserts the text into the user's previous form field.",
  "Keep the final inserted text clean and do not include meta commentary unless the user dictates it.",
].join(" ");

type MobileDrawerGesture = {
  startX: number;
  startY: number;
  intent: "open" | "close";
};

function isEditableSwipeTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest("input, textarea, select, [contenteditable='true']"),
  );
}

export default function App() {
  const [auth, setAuth] = useState<AuthState | null>(loadAuth);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [isExchangingToken, setIsExchangingToken] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [floatingVoiceDraft, setFloatingVoiceDraft] = useState("");
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
  const mobileDrawerGestureRef = useRef<MobileDrawerGesture | null>(null);

  const { theme, setTheme } = useTheme();
  const { sendKey, setSendKey } = useSendKey();
  const {
    realtimeVoiceEnabled,
    setRealtimeVoiceEnabled,
    realtimeSoundEnabled,
    setRealtimeSoundEnabled,
    floatingVoiceOpenOnStartup,
    setFloatingVoiceOpenOnStartup,
    voiceDotMenuBarIconEnabled,
    setVoiceDotMenuBarIconEnabled,
  } = useRealtimeVoiceSettings();
  const { globalCustomInstructions, setGlobalCustomInstructions } =
    useGlobalCustomInstructions();
  const { maxRequests, setMaxRequests } = useMaxRequests();
  const navigate = useNavigate();
  const location = useLocation();
  const isFloatingVoiceInput = location.pathname === "/voice-input";
  const didOpenFloatingVoiceOnStartupRef = useRef(false);
  const didRegisterFloatingVoiceShortcutRef = useRef(false);
  const showWorkFolders = location.pathname.startsWith("/work-folders");
  const showHelp = location.pathname === "/help";
  const showSettings = location.pathname === "/settings";
  const isMacDesktop = isTauriMacOS();
  const supportsDesktopTools = isTauriDesktop();
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
          apiBaseUrl: getConfiguredApiBaseUrl(),
          accessToken: tokens.access_token,
          tenantId: getConfiguredDefaultTenantId(),
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
    maxRequests,
  );
  const {
    chunks,
    clearError,
    input: chatInput,
    isLoading: isChatLoading,
    newChat,
    selectedModel,
    sendMessage,
    sessionId,
    setInput: setChatInput,
    setSelectedModel,
    error: chatError,
  } = chat;

  const agentChatDraftRef = useRef(chatInput);
  const floatingVoiceDraftRef = useRef(floatingVoiceDraft);
  const selectedModelRef = useRef(selectedModel);
  const agentChunksRef = useRef(chunks);
  useEffect(() => {
    agentChatDraftRef.current = chatInput;
  }, [chatInput]);
  useEffect(() => {
    floatingVoiceDraftRef.current = floatingVoiceDraft;
  }, [floatingVoiceDraft]);
  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);
  useEffect(() => {
    agentChunksRef.current = chunks;
  }, [chunks]);
  const realtimePausedForAgentRef = useRef(false);
  const realtimeControlRef = useRef<{
    status: "idle" | "connecting" | "connected";
    start: () => Promise<void>;
    stop: () => void;
  }>({
    status: "idle",
    start: async () => undefined,
    stop: () => undefined,
  });

  const pauseRealtimeForAgentTurn = useCallback(() => {
    const realtime = realtimeControlRef.current;
    if (realtime.status !== "connecting" && realtime.status !== "connected") {
      return;
    }
    realtimePausedForAgentRef.current = true;
    realtime.stop();
  }, []);

  const setAgentChatDraftFromRealtime = useCallback(
    (text: string) => {
      if (isFloatingVoiceInput) {
        floatingVoiceDraftRef.current = text;
        setFloatingVoiceDraft(text);
        return;
      }
      agentChatDraftRef.current = text;
      setChatInput(text);
    },
    [isFloatingVoiceInput, setChatInput],
  );

  const submitAgentChatDraftFromRealtime = useCallback(
    (text: string) => {
      const message = text.trim();
      if (!message) return;
      if (isFloatingVoiceInput) {
        floatingVoiceDraftRef.current = "";
        setFloatingVoiceDraft("");
        void insertTextToFocusedApp(message).catch((error) => {
          console.warn("Failed to insert floating voice text.", error);
        });
        return;
      }
      pauseRealtimeForAgentTurn();
      agentChatDraftRef.current = "";
      setChatInput("");
      void sendMessage(message, undefined, undefined, selectedModelRef.current);
    },
    [
      isFloatingVoiceInput,
      pauseRealtimeForAgentTurn,
      sendMessage,
      setChatInput,
    ],
  );

  const realtimeVoice = useRealtimeVoice(client, {
    getAgentChatDraft: () =>
      isFloatingVoiceInput
        ? floatingVoiceDraftRef.current
        : agentChatDraftRef.current,
    getAgentChatContext: () =>
      isFloatingVoiceInput
        ? "現在は任意フォーム入力モードです。送信ツールは前にフォーカスしていたフォームへテキストを貼り付けます。"
        : buildRealtimeAgentChatContext(agentChunksRef.current),
    onSetAgentChatDraft: setAgentChatDraftFromRealtime,
    onSubmitAgentChatDraft: submitAgentChatDraftFromRealtime,
    onSubmitFocusedForm: isFloatingVoiceInput
      ? () => pressCmdEnterToFocusedApp()
      : undefined,
    onStopRealtimeVoice: isFloatingVoiceInput
      ? () => hideCurrentTauriWindow()
      : undefined,
    soundEnabled: realtimeSoundEnabled,
    instructions: isFloatingVoiceInput
      ? FLOATING_VOICE_INPUT_INSTRUCTIONS
      : undefined,
  });
  const realtimeVoiceStatus = realtimeVoice.status;
  const startRealtimeVoice = realtimeVoice.start;
  const stopRealtimeVoice = realtimeVoice.stop;
  const realtimeTranscripts = realtimeVoice.transcripts;
  const appendRealtimeTranscript = realtimeVoice.appendTranscript;
  const previousChatErrorRef = useRef<string | null>(null);

  useEffect(() => {
    realtimeControlRef.current = {
      status: realtimeVoiceStatus,
      start: startRealtimeVoice,
      stop: stopRealtimeVoice,
    };
  }, [realtimeVoiceStatus, startRealtimeVoice, stopRealtimeVoice]);

  useEffect(() => {
    if (!realtimeVoiceEnabled) {
      realtimePausedForAgentRef.current = false;
      return;
    }
    if (isChatLoading || !realtimePausedForAgentRef.current) return;

    realtimePausedForAgentRef.current = false;
    if (realtimeVoiceStatus === "idle") {
      void startRealtimeVoice();
    }
  }, [
    isChatLoading,
    realtimeVoiceStatus,
    realtimeVoiceEnabled,
    startRealtimeVoice,
  ]);

  useEffect(() => {
    if (!realtimeSoundEnabled) return;
    if (!isChatLoading) return;

    playRealtimeCue("thinking");
    const interval = window.setInterval(() => {
      playRealtimeCue("thinking");
    }, 2800);

    return () => {
      window.clearInterval(interval);
    };
  }, [isChatLoading, realtimeSoundEnabled]);

  useEffect(() => {
    const currentError = chatError?.message ?? null;
    if (
      realtimeVoiceEnabled &&
      realtimeSoundEnabled &&
      currentError &&
      currentError !== previousChatErrorRef.current
    ) {
      playRealtimeCue("error");
    }
    previousChatErrorRef.current = currentError;
  }, [chatError?.message, realtimeSoundEnabled, realtimeVoiceEnabled]);

  const sendMessageWithRealtimePause = useCallback(
    async (
      message: string,
      attachments?: Parameters<typeof sendMessage>[1],
      taskOverride?: Parameters<typeof sendMessage>[2],
      modelOverride?: Parameters<typeof sendMessage>[3],
    ) => {
      pauseRealtimeForAgentTurn();
      await sendMessage(message, attachments, taskOverride, modelOverride);
    },
    [pauseRealtimeForAgentTurn, sendMessage],
  );

  const chatWithRealtimePause = useMemo(
    () => ({
      ...chat,
      sendMessage: sendMessageWithRealtimePause,
    }),
    [chat, sendMessageWithRealtimePause],
  );

  useEffect(() => {
    if (!realtimeVoiceEnabled) {
      stopRealtimeVoice();
    }
  }, [realtimeVoiceEnabled, stopRealtimeVoice]);

  useEffect(() => {
    if (!isTauriDesktop() || isFloatingVoiceInput) {
      return;
    }

    const openFromShortcut = () => {
      void openAndStartFloatingVoiceInput().catch((error) => {
        console.warn(
          "Failed to open floating voice input from shortcut.",
          error,
        );
      });
    };
    let disposed = false;
    const unlisteners: Array<() => void> = [];

    void listenFloatingVoiceStart(openFromShortcut).then((unlisten) => {
      if (disposed) {
        unlisten();
        return;
      }
      unlisteners.push(unlisten);
    });

    if (!didRegisterFloatingVoiceShortcutRef.current) {
      didRegisterFloatingVoiceShortcutRef.current = true;
      void registerFloatingVoiceShortcut(openFromShortcut).then((shortcut) => {
        if (shortcut) {
          console.info(`Floating voice input shortcut registered: ${shortcut}`);
        }
      });
    }

    return () => {
      disposed = true;
      for (const unlisten of unlisteners) {
        unlisten();
      }
    };
  }, [isFloatingVoiceInput]);

  useEffect(() => {
    if (
      !auth ||
      isFloatingVoiceInput ||
      !isTauriDesktop() ||
      !floatingVoiceOpenOnStartup ||
      didOpenFloatingVoiceOnStartupRef.current
    ) {
      return;
    }

    didOpenFloatingVoiceOnStartupRef.current = true;
    void openFloatingVoiceInputWindow().catch((error) => {
      console.warn("Failed to open floating voice input on startup.", error);
    });
  }, [auth, floatingVoiceOpenOnStartup, isFloatingVoiceInput]);

  const modelOptions = useMemo(
    () => resolveModelOptions(availableModels),
    [availableModels],
  );
  const hasSideSurface =
    !isMobile && (artifactState.canvas.isOpen || artifactState.isPanelOpen);

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
        realtimeTranscripts,
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
      sendMessage: async (message, taskOverride, modelOverride) => {
        await sendMessage(message, undefined, taskOverride, modelOverride);
      },
      appendRealtimeVoiceTranscript: (message) => {
        appendRealtimeTranscript(message);
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
    appendRealtimeTranscript,
    realtimeTranscripts,
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

  const handleOpenHelp = useCallback(() => {
    navigate("/help");
    if (isMobile) {
      setSidebarCollapsed(true);
    }
  }, [isMobile, navigate]);

  const handleOpenSettings = useCallback(() => {
    navigate("/settings");
    if (isMobile) {
      setSidebarCollapsed(true);
    }
  }, [isMobile, navigate]);

  const handleOpenSessionFromWorkFolder = useCallback(
    (sessionId: string) => {
      chat.selectSession(sessionId);
      closeCanvas();
      navigate("/");
    },
    [chat, closeCanvas, navigate],
  );

  const handlePickProject = useCallback(async () => {
    if (!supportsDesktopTools) return;
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === "string") {
      await activateProject(selected);
      await refreshMcpTools();
      if (location.pathname.startsWith("/work-folders")) {
        openWorkFolderPage(selected);
      }
    }
  }, [
    activateProject,
    refreshMcpTools,
    location.pathname,
    openWorkFolderPage,
    supportsDesktopTools,
  ]);

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

  const handleNewChat = useCallback(() => {
    chat.newChat();
    artifactState.closeCanvas();
    navigate("/");
    handleMobileSidebarClose();
  }, [artifactState.closeCanvas, chat, handleMobileSidebarClose, navigate]);

  const handleStartChatFromWorkFolder = useCallback(() => {
    handleNewChat();
  }, [handleNewChat]);

  useEffect(() => {
    if (!supportsDesktopTools) return;
    void setVoiceDotMenuBarIconVisible(voiceDotMenuBarIconEnabled).catch(
      (error) => {
        console.warn("Failed to update Voice Dot menu bar icon.", error);
      },
    );
  }, [supportsDesktopTools, voiceDotMenuBarIconEnabled]);

  useEffect(() => {
    if (!supportsDesktopTools) return;

    let disposed = false;
    let unlistenNewChat: (() => void) | undefined;
    let unlistenOpenSettings: (() => void) | undefined;

    void listenVoiceDotNewChat(() => {
      if (auth) {
        handleNewChat();
      }
    }).then((fn) => {
      if (disposed) {
        fn();
        return;
      }
      unlistenNewChat = fn;
    });

    void listenVoiceDotOpenSettings(() => {
      if (auth) {
        handleOpenSettings();
      }
    }).then((fn) => {
      if (disposed) {
        fn();
        return;
      }
      unlistenOpenSettings = fn;
    });

    return () => {
      disposed = true;
      unlistenNewChat?.();
      unlistenOpenSettings?.();
    };
  }, [auth, handleNewChat, handleOpenSettings, supportsDesktopTools]);

  const handleMobileDrawerTouchStart = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      mobileDrawerGestureRef.current = null;
      if (
        !isMobile ||
        event.touches.length !== 1 ||
        isEditableSwipeTarget(event.target)
      ) {
        return;
      }

      const touch = event.touches.item(0);
      if (!touch) return;

      if (sidebarCollapsed) {
        if (touch.clientX > MOBILE_DRAWER_EDGE_SWIPE_ZONE_PX) return;
        mobileDrawerGestureRef.current = {
          startX: touch.clientX,
          startY: touch.clientY,
          intent: "open",
        };
        return;
      }

      if (touch.clientX > MOBILE_DRAWER_CLOSE_SWIPE_ZONE_PX) return;
      mobileDrawerGestureRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        intent: "close",
      };
    },
    [isMobile, sidebarCollapsed],
  );

  const handleMobileDrawerTouchMove = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      const gesture = mobileDrawerGestureRef.current;
      const touch = event.touches.item(0);
      if (!gesture || !touch) return;

      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;
      if (Math.abs(deltaY) > 24 && Math.abs(deltaY) > Math.abs(deltaX)) {
        mobileDrawerGestureRef.current = null;
      }
    },
    [],
  );

  const handleMobileDrawerTouchEnd = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      const gesture = mobileDrawerGestureRef.current;
      mobileDrawerGestureRef.current = null;
      const touch = event.changedTouches.item(0);
      if (!gesture || !touch) return;

      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (
        absX < MOBILE_DRAWER_SWIPE_DISTANCE_PX ||
        absY > MOBILE_DRAWER_SWIPE_MAX_VERTICAL_PX ||
        absX < absY * MOBILE_DRAWER_SWIPE_DOMINANCE_RATIO
      ) {
        return;
      }

      if (gesture.intent === "open" && deltaX > 0) {
        setSidebarCollapsed(false);
      } else if (gesture.intent === "close" && deltaX < 0) {
        setSidebarCollapsed(true);
      }
    },
    [],
  );

  const handleMobileDrawerTouchCancel = useCallback(() => {
    mobileDrawerGestureRef.current = null;
  }, []);

  // Keyboard shortcuts
  useKeyboardShortcuts(
    useMemo(
      () => ({
        onNewChat: () => {
          if (auth) {
            handleNewChat();
          }
        },
        onSearch: () => {
          if (auth) setSearchOpen((prev) => !prev);
        },
        onSettings: () => {
          if (searchOpen) {
            setSearchOpen(false);
          }
        },
      }),
      [
        auth,
        handleNewChat,
        searchOpen,
      ],
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
              description="オフラインでも、選択したフォルダの検索・整理・重複検出・容量分析を使えます"
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
        onEnterOfflineMode={
          supportsDesktopTools ? () => setOfflineMode(true) : undefined
        }
      />
    );
  }

  if (isFloatingVoiceInput) {
    return (
      <FloatingVoiceInput
        isEnabled={realtimeVoiceEnabled}
        onEnable={() => setRealtimeVoiceEnabled(true)}
        realtimeVoice={realtimeVoice}
      />
    );
  }

  return (
    <div
      className={desktopShellClass}
      onTouchStart={handleMobileDrawerTouchStart}
      onTouchMove={handleMobileDrawerTouchMove}
      onTouchEnd={handleMobileDrawerTouchEnd}
      onTouchCancel={handleMobileDrawerTouchCancel}
    >
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
              ? `fixed inset-y-3 left-3 z-[70] w-[240px] overflow-hidden rounded-[28px] surface-panel transition-transform duration-200 md:w-[280px] ${sidebarCollapsed ? "pointer-events-none -translate-x-[calc(100%+1rem)]" : "translate-x-0"}`
              : `shrink-0 ${sidebarCollapsed ? (isMacDesktop ? "w-[76px]" : "w-14") : "w-[286px]"} transition-all duration-200 overflow-hidden`
          }
        `}
      >
        <Sidebar
          sessions={chat.sessions}
          activeSessionId={chat.sessionId}
          pinnedRooms={chat.pinnedRooms}
          onNewChat={() => {
            handleNewChat();
          }}
          onSelectSession={(id: string) => {
            chat.selectSession(id);
            artifactState.closeCanvas();
            navigate("/");
            handleMobileSidebarClose();
          }}
          onDeleteRoom={chat.deleteRoom}
          onTogglePin={chat.togglePin}
          showWorkFolders={showWorkFolders}
          showHelp={showHelp}
          showSettings={showSettings}
          onOpenHelp={handleOpenHelp}
          onOpenSettings={handleOpenSettings}
          isCollapsed={isMobile ? false : sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
          activeProject={activeProject}
          recentProjects={recentProjects}
          onPickProject={supportsDesktopTools ? handlePickProject : undefined}
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
                  chat={chatWithRealtimePause}
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
                  onOpenTools={
                    supportsDesktopTools ? () => navigate("/tools") : undefined
                  }
                  projectContext={
                    supportsDesktopTools ? projectContext : undefined
                  }
                  onToggleSidebar={
                    isMobile
                      ? () => setSidebarCollapsed((prev) => !prev)
                      : undefined
                  }
                  realtimeVoice={
                    realtimeVoiceEnabled ? realtimeVoice : undefined
                  }
                />
              }
            />
            {supportsDesktopTools && (
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
              path="/help"
              element={
                <HelpPanel
                  onBack={handleBackToChat}
                  onOpenTools={
                    supportsDesktopTools ? () => navigate("/tools") : undefined
                  }
                  onOpenWorkFolders={
                    supportsDesktopTools
                      ? () => openWorkFolderPage(activeProject?.path)
                      : undefined
                  }
                />
              }
            />
            <Route
              path="/settings"
              element={
                <SettingsPage
                  onBack={handleBackToChat}
                  theme={theme}
                  onThemeChange={setTheme}
                  selectedModel={chat.selectedModel}
                  modelOptions={modelOptions}
                  onModelChange={chat.setSelectedModel}
                  onLogout={handleLogout}
                  apiBaseUrl={auth.apiBaseUrl}
                  tenantId={auth.tenantId}
                  onMcpConfigChanged={
                    supportsDesktopTools ? refreshMcpTools : undefined
                  }
                  showMcpSettings={supportsDesktopTools}
                  sendKey={sendKey}
                  onSendKeyChange={setSendKey}
                  realtimeVoiceEnabled={realtimeVoiceEnabled}
                  onRealtimeVoiceEnabledChange={setRealtimeVoiceEnabled}
                  realtimeSoundEnabled={realtimeSoundEnabled}
                  onRealtimeSoundEnabledChange={setRealtimeSoundEnabled}
                  floatingVoiceOpenOnStartup={floatingVoiceOpenOnStartup}
                  onFloatingVoiceOpenOnStartupChange={
                    setFloatingVoiceOpenOnStartup
                  }
                  voiceDotMenuBarIconEnabled={voiceDotMenuBarIconEnabled}
                  onVoiceDotMenuBarIconEnabledChange={
                    setVoiceDotMenuBarIconEnabled
                  }
                  onOpenFloatingVoiceInput={
                    supportsDesktopTools
                      ? () => {
                          void openFloatingVoiceInputWindow().catch((error) => {
                            console.warn(
                              "Failed to open floating voice input.",
                              error,
                            );
                          });
                        }
                      : undefined
                  }
                  globalCustomInstructions={globalCustomInstructions}
                  onGlobalCustomInstructionsChange={setGlobalCustomInstructions}
                  maxRequests={maxRequests}
                  onMaxRequestsChange={setMaxRequests}
                />
              }
            />
            {supportsDesktopTools && (
              <>
                <Route
                  path="/work-folders"
                  element={
                    <WorkFolderListPanel
                      onBack={handleBackToChat}
                      onStartChat={handleStartChatFromWorkFolder}
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
              </>
            )}
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
            isMobile={isMobile}
          />
        ) : (
          <ArtifactPanel
            artifact={artifactState.selectedArtifact}
            isOpen={artifactState.isPanelOpen}
            onClose={artifactState.closePanel}
            onDownload={artifactState.downloadArtifact}
            onSwitchVersion={artifactState.switchVersion}
            onOpenCanvas={artifactState.openCanvas}
            isMobile={isMobile}
          />
        )}
      </div>
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
