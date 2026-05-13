/**
 * Platform abstraction for Tauri / Web file operations.
 *
 * All Tauri imports are lazy (dynamic) so that this module can be loaded
 * in a plain browser without the @tauri-apps packages being present.
 */

import type { ToolCall, ToolResult } from "./types";
import type { AuthState } from "./auth";
import { getConfiguredApiBaseUrl } from "./auth-config";
import type { WebviewWindow } from "@tauri-apps/api/webviewWindow";

type TauriGlobal = typeof globalThis & {
  isTauri?: boolean;
  __TAURI__?: unknown;
  __TAURI_INTERNALS__?: unknown;
};

/** Detect whether we are running inside a Tauri webview. */
export function isTauri(): boolean {
  if (typeof globalThis === "undefined") {
    return false;
  }

  const tauriGlobal = globalThis as TauriGlobal;
  return (
    tauriGlobal.isTauri === true ||
    "__TAURI__" in tauriGlobal ||
    "__TAURI_INTERNALS__" in tauriGlobal
  );
}

/** Read the application marketing version from Tauri. Returns null on web. */
export async function getTauriAppVersion(): Promise<string | null> {
  if (!isTauri()) {
    return null;
  }

  const { getVersion } = await import("@tauri-apps/api/app");
  return getVersion();
}

export type TauriPlatform = "android" | "ios" | "linux" | "macos" | "windows";

const MOBILE_TAURI_PLATFORMS = new Set<TauriPlatform>(["android", "ios"]);

export function getTauriPlatform(): TauriPlatform | null {
  const platform = import.meta.env.TAURI_ENV_PLATFORM;
  if (
    platform === "android" ||
    platform === "ios" ||
    platform === "linux" ||
    platform === "macos" ||
    platform === "windows"
  ) {
    return platform;
  }

  return null;
}

export function isTauriMobile(): boolean {
  const platform = getTauriPlatform();
  return isTauri() && !!platform && MOBILE_TAURI_PLATFORMS.has(platform);
}

export function isTauriDesktop(): boolean {
  return isTauri() && !isTauriMobile();
}

export function isTauriMacOS(): boolean {
  return (
    isTauriDesktop() &&
    typeof navigator !== "undefined" &&
    /Mac/i.test(navigator.userAgent)
  );
}

export async function startTauriWindowDrag(): Promise<void> {
  if (!isTauriDesktop()) {
    return;
  }

  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().startDragging();
}

export async function hideCurrentTauriWindow(): Promise<void> {
  if (!isTauriDesktop()) {
    return;
  }

  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().hide();
}

export async function interceptCurrentTauriWindowClose(
  onClose?: () => void,
): Promise<() => void> {
  if (!isTauriDesktop()) {
    return () => undefined;
  }

  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow().onCloseRequested((event) => {
    event.preventDefault();
    onClose?.();
    void getCurrentWindow().hide();
  });
}

const FLOATING_VOICE_WINDOW_LABEL = "voice-input";
const FLOATING_VOICE_SET_DRAFT_EVENT = "floating-voice:set-draft";
const FLOATING_VOICE_SUBMIT_DRAFT_EVENT = "floating-voice:submit-draft";
const FLOATING_VOICE_START_EVENT = "floating-voice:start";
const FLOATING_VOICE_STOP_AND_HIDE_EVENT = "floating-voice:stop-and-hide";
const VOICE_DOT_NEW_CHAT_EVENT = "voice-dot:new-chat";
const VOICE_DOT_OPEN_SETTINGS_EVENT = "voice-dot:open-settings";
let floatingVoiceStartRequestInFlight = false;
let lastFloatingVoiceStartRequestAt = 0;
const FLOATING_VOICE_WINDOW_SIZE = {
  width: 48,
  idleHeight: 6,
  activeHeight: 12,
} as const;

type PositionedTauriWindow = Pick<WebviewWindow, "setPosition">;

async function getFloatingVoiceBottomCenterPosition(height: number): Promise<{
  x: number;
  y: number;
} | null> {
  const { primaryMonitor } = await import("@tauri-apps/api/window");
  const monitor = await primaryMonitor();
  if (!monitor) return null;

  const workArea = monitor.workArea;
  const scaleFactor = monitor.scaleFactor || 1;
  const workX = workArea.position.x / scaleFactor;
  const workY = workArea.position.y / scaleFactor;
  const workWidth = workArea.size.width / scaleFactor;
  const workHeight = workArea.size.height / scaleFactor;
  const x =
    workX + Math.round((workWidth - FLOATING_VOICE_WINDOW_SIZE.width) / 2);
  const y =
    workY + Math.round(workHeight - height - 12);

  return { x, y };
}

async function placeFloatingVoiceWindowNearBottomCenter(
  window: PositionedTauriWindow,
  height: number = FLOATING_VOICE_WINDOW_SIZE.idleHeight,
): Promise<void> {
  const { LogicalPosition } = await import("@tauri-apps/api/window");
  const position = await getFloatingVoiceBottomCenterPosition(height);
  if (!position) return;

  await window.setPosition(new LogicalPosition(position.x, position.y));
}

async function setFloatingVoiceWindowSize(
  window: WebviewWindow,
  height: number,
): Promise<void> {
  const { LogicalSize } = await import("@tauri-apps/api/window");
  const size = new LogicalSize(FLOATING_VOICE_WINDOW_SIZE.width, height);

  await window.setMinSize(null);
  await window.setMaxSize(null);
  await window.setSize(size);
  await window.setMinSize(size);
  await window.setMaxSize(size);
  await placeFloatingVoiceWindowNearBottomCenter(window, height);
}

async function applyVoiceDotNativeWindowShape(): Promise<void> {
  if (!isTauriMacOS()) {
    return;
  }

  try {
    await tauriInvoke<void>("apply_voice_dot_window_shape");
  } catch (error) {
    console.warn("Failed to apply Voice Dot native window shape:", error);
  }
}

export type FloatingVoiceDraftPayload = {
  text: string;
};

export async function openFloatingVoiceInputWindow(): Promise<void> {
  if (!isTauriDesktop()) {
    return;
  }

  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const voiceDotPosition = await getFloatingVoiceBottomCenterPosition(
    FLOATING_VOICE_WINDOW_SIZE.idleHeight,
  );
  const existing = await WebviewWindow.getByLabel(FLOATING_VOICE_WINDOW_LABEL);
  if (existing) {
    await setFloatingVoiceWindowSize(
      existing,
      FLOATING_VOICE_WINDOW_SIZE.idleHeight,
    );
    await existing.show();
    await existing.setAlwaysOnTop(true);
    await existing.setFocusable(false);
    await applyVoiceDotNativeWindowShape();
    return;
  }

  const voiceWindow = new WebviewWindow(FLOATING_VOICE_WINDOW_LABEL, {
    url: "/#/voice-input",
    title: "Tachyon Voice Input",
    width: FLOATING_VOICE_WINDOW_SIZE.width,
    height: FLOATING_VOICE_WINDOW_SIZE.idleHeight,
    minWidth: FLOATING_VOICE_WINDOW_SIZE.width,
    minHeight: FLOATING_VOICE_WINDOW_SIZE.idleHeight,
    maxWidth: FLOATING_VOICE_WINDOW_SIZE.width,
    maxHeight: FLOATING_VOICE_WINDOW_SIZE.idleHeight,
    x: voiceDotPosition?.x ?? 0,
    y: voiceDotPosition?.y ?? 0,
    resizable: false,
    decorations: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: false,
    backgroundColor: "#111111",
    shadow: true,
    visible: true,
    focus: false,
    focusable: false,
  });

  await new Promise<void>((resolve, reject) => {
    void voiceWindow.once("tauri://created", () => resolve());
    void voiceWindow.once("tauri://error", (event) =>
      reject(new Error(String(event.payload))),
    );
  });
  await voiceWindow.setAlwaysOnTop(true);
  await voiceWindow.setFocusable(false);
  await placeFloatingVoiceWindowNearBottomCenter(voiceWindow);
  await applyVoiceDotNativeWindowShape();
}

export async function resizeCurrentFloatingVoiceInputWindow(
  isActive: boolean,
): Promise<void> {
  if (!isTauriDesktop()) {
    return;
  }

  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await setFloatingVoiceWindowSize(
    getCurrentWindow() as unknown as WebviewWindow,
    isActive
      ? FLOATING_VOICE_WINDOW_SIZE.activeHeight
      : FLOATING_VOICE_WINDOW_SIZE.idleHeight,
  );
  await applyVoiceDotNativeWindowShape();
}

export async function openAndStartFloatingVoiceInput(): Promise<void> {
  const now = Date.now();
  if (
    floatingVoiceStartRequestInFlight ||
    now - lastFloatingVoiceStartRequestAt < 1000
  ) {
    return;
  }

  floatingVoiceStartRequestInFlight = true;
  lastFloatingVoiceStartRequestAt = now;
  try {
    await openFloatingVoiceInputWindow();
    await new Promise((resolve) => globalThis.setTimeout(resolve, 300));
    await emitFloatingVoiceStart();
  } finally {
    globalThis.setTimeout(() => {
      floatingVoiceStartRequestInFlight = false;
    }, 1000);
  }
}

export async function emitFloatingVoiceSetDraft(text: string): Promise<void> {
  if (!isTauriDesktop()) {
    return;
  }

  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().emitTo<FloatingVoiceDraftPayload>(
    "main",
    FLOATING_VOICE_SET_DRAFT_EVENT,
    { text },
  );
}

export async function emitFloatingVoiceSubmitDraft(
  text: string,
): Promise<void> {
  if (!isTauriDesktop()) {
    return;
  }

  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().emitTo<FloatingVoiceDraftPayload>(
    "main",
    FLOATING_VOICE_SUBMIT_DRAFT_EVENT,
    { text },
  );
}

export async function emitFloatingVoiceStart(): Promise<void> {
  if (!isTauriDesktop()) {
    return;
  }

  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().emitTo("voice-input", FLOATING_VOICE_START_EVENT);
}

function isFloatingVoiceDraftPayload(
  payload: unknown,
): payload is FloatingVoiceDraftPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "text" in payload &&
    typeof (payload as { text?: unknown }).text === "string"
  );
}

export async function listenFloatingVoiceSetDraft(
  handler: (payload: FloatingVoiceDraftPayload) => void,
): Promise<() => void> {
  if (!isTauriDesktop()) {
    return () => undefined;
  }

  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow().listen<unknown>(
    FLOATING_VOICE_SET_DRAFT_EVENT,
    (event) => {
      if (isFloatingVoiceDraftPayload(event.payload)) {
        handler(event.payload);
      }
    },
  );
}

export async function listenFloatingVoiceSubmitDraft(
  handler: (payload: FloatingVoiceDraftPayload) => void,
): Promise<() => void> {
  if (!isTauriDesktop()) {
    return () => undefined;
  }

  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow().listen<unknown>(
    FLOATING_VOICE_SUBMIT_DRAFT_EVENT,
    (event) => {
      if (isFloatingVoiceDraftPayload(event.payload)) {
        handler(event.payload);
      }
    },
  );
}

export async function listenFloatingVoiceStart(
  handler: () => void,
): Promise<() => void> {
  if (!isTauriDesktop()) {
    return () => undefined;
  }

  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow().listen(FLOATING_VOICE_START_EVENT, () => handler());
}

export async function listenFloatingVoiceStopAndHide(
  handler: () => void,
): Promise<() => void> {
  if (!isTauriDesktop()) {
    return () => undefined;
  }

  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow().listen(FLOATING_VOICE_STOP_AND_HIDE_EVENT, () =>
    handler(),
  );
}

export async function listenVoiceDotNewChat(
  handler: () => void,
): Promise<() => void> {
  if (!isTauriDesktop()) {
    return () => undefined;
  }

  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow().listen(VOICE_DOT_NEW_CHAT_EVENT, () => handler());
}

export async function listenVoiceDotOpenSettings(
  handler: () => void,
): Promise<() => void> {
  if (!isTauriDesktop()) {
    return () => undefined;
  }

  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow().listen(VOICE_DOT_OPEN_SETTINGS_EVENT, () =>
    handler(),
  );
}

export async function setVoiceDotMenuBarIconVisible(
  visible: boolean,
): Promise<void> {
  if (!isTauriDesktop()) {
    return;
  }

  await tauriInvoke<void>("set_voice_dot_tray_visible", { visible });
}

export async function registerFloatingVoiceShortcut(
  handler: () => void,
): Promise<string | null> {
  if (!isTauriDesktop()) {
    return null;
  }

  const { register } = await import("@tauri-apps/plugin-global-shortcut");
  const candidates = ["Fn", "F19", "CommandOrControl+Shift+Space"];

  for (const shortcut of candidates) {
    try {
      await register(shortcut, (event) => {
        if (event.state === "Pressed") {
          handler();
        }
      });
      return shortcut;
    } catch (error) {
      console.warn(`Failed to register ${shortcut} shortcut.`, error);
    }
  }

  return null;
}

export async function insertTextToFocusedApp(text: string): Promise<void> {
  if (!isTauriDesktop()) {
    throw new Error("external text insertion is only available in Tauri");
  }

  await tauriInvoke<void>("insert_text_to_focused_app", { text });
}

/** Lazy wrapper around `@tauri-apps/api/core` invoke. */
async function tauriInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

function resolveRuntimeAuthApiBaseUrl(apiBaseUrl: string): string {
  const trimmed = apiBaseUrl.trim().replace(/\/+$/, "");
  if (!trimmed.startsWith("/")) {
    return trimmed;
  }

  return getConfiguredApiBaseUrl().trim().replace(/\/+$/, "");
}

/** Read a local file via the Tauri FS plugin. Throws on web. */
export async function readLocalFile(path: string): Promise<Uint8Array> {
  if (!isTauri()) {
    throw new Error("readLocalFile is only available in Tauri");
  }
  const { readFile } = await import("@tauri-apps/plugin-fs");
  return readFile(path);
}

/** Execute a client-side tool via the Tauri backend. Throws on web. */
export async function executeClientTool(
  toolCall: ToolCall,
): Promise<ToolResult> {
  if (!isTauri()) {
    throw new Error("client-side tools are only available in Tauri");
  }
  return tauriInvoke<ToolResult>("execute_tool", { toolCall });
}

export async function setTauriRuntimeAuth(auth: AuthState): Promise<void> {
  if (!isTauri()) {
    throw new Error("runtime auth sync is only available in Tauri");
  }

  await tauriInvoke<void>("chat_set_runtime_auth", {
    auth: {
      apiBaseUrl: resolveRuntimeAuthApiBaseUrl(auth.apiBaseUrl),
      accessToken: auth.accessToken,
      tenantId: auth.tenantId,
      userId: auth.userId,
    },
  });
}

export async function clearTauriRuntimeAuth(): Promise<void> {
  if (!isTauri()) {
    throw new Error("runtime auth sync is only available in Tauri");
  }

  await tauriInvoke<void>("chat_clear_runtime_auth");
}

export async function authenticateWithTauriMobileSession(params: {
  authUrl: string;
  callbackScheme: string;
}): Promise<string> {
  if (!isTauriMobile()) {
    throw new Error("native auth session is only available on Tauri mobile");
  }

  const response = await tauriInvoke<{ url: string }>(
    "auth_session_authenticate",
    {
      authUrl: params.authUrl,
      callbackScheme: params.callbackScheme,
    },
  );
  return response.url;
}

// ── MCP Types ──────────────────────────────────────────────────────

export type McpTransportConfig =
  | {
      type: "stdio";
      command: string;
      args: string[];
      env: Record<string, string>;
    }
  | { type: "sse"; url: string; headers: Record<string, string> };

export type McpServerConfig = {
  id: string;
  name: string;
  enabled: boolean;
  transport: McpTransportConfig;
  builtin: boolean;
};

export type McpConfig = {
  servers: McpServerConfig[];
};

export type McpToolInfo = {
  namespaced_name: string;
  original_name: string;
  server_id: string;
  server_name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export type McpServerStatus = {
  id: string;
  name: string;
  enabled: boolean;
  connected: boolean;
  tool_count: number;
  error?: string;
  builtin: boolean;
  description?: string;
};

export type BuiltinAppInfo = {
  id: string;
  name: string;
  description: string;
  tools: {
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }[];
};

export type ProjectEntry = {
  path: string;
  name: string;
  last_accessed_at: string;
};

export type ProjectState = {
  active_project: ProjectEntry | null;
  recent_projects: ProjectEntry[];
};

export type ProjectContext = {
  root_path: string;
  name: string;
  workspace_path: string;
  agents_path: string;
  agent_dir: string;
  has_agents_file: boolean;
  has_agent_dir: boolean;
  custom_instructions?: string | null;
  prompt_context: string;
};

// ── MCP Bridge Functions ───────────────────────────────────────────

export async function mcpGetConfig(): Promise<McpConfig> {
  return tauriInvoke<McpConfig>("mcp_get_config");
}

export async function mcpAddServer(
  server: McpServerConfig,
): Promise<McpConfig> {
  return tauriInvoke<McpConfig>("mcp_add_server", { server });
}

export async function mcpRemoveServer(serverId: string): Promise<McpConfig> {
  return tauriInvoke<McpConfig>("mcp_remove_server", { serverId });
}

export async function mcpToggleServer(
  serverId: string,
  enabled: boolean,
): Promise<void> {
  return tauriInvoke<void>("mcp_toggle_server", { serverId, enabled });
}

export async function mcpGetTools(): Promise<McpToolInfo[]> {
  return tauriInvoke<McpToolInfo[]>("mcp_get_tools");
}

export async function mcpGetServerStatuses(): Promise<McpServerStatus[]> {
  return tauriInvoke<McpServerStatus[]>("mcp_get_server_statuses");
}

export async function mcpToggleBuiltinApp(
  appId: string,
  enabled: boolean,
): Promise<void> {
  return tauriInvoke<void>("mcp_toggle_builtin_app", { appId, enabled });
}

export async function mcpGetBuiltinApps(): Promise<BuiltinAppInfo[]> {
  return tauriInvoke<BuiltinAppInfo[]>("mcp_get_builtin_apps");
}

export async function projectGetState(): Promise<ProjectState> {
  return tauriInvoke<ProjectState>("project_get_state");
}

export async function projectSetActive(path: string): Promise<ProjectState> {
  return tauriInvoke<ProjectState>("project_set_active", { path });
}

export async function projectRemoveRecent(path: string): Promise<ProjectState> {
  return tauriInvoke<ProjectState>("project_remove_recent", { path });
}

export async function projectGetActiveContext(): Promise<ProjectContext | null> {
  return tauriInvoke<ProjectContext | null>("project_get_active_context");
}

export async function projectInitializeActive(): Promise<ProjectContext> {
  return tauriInvoke<ProjectContext>("project_initialize_active");
}

export async function projectUpdateActiveCustomInstructions(
  customInstructions: string,
): Promise<ProjectContext> {
  return tauriInvoke<ProjectContext>(
    "project_update_active_custom_instructions",
    {
      customInstructions,
      custom_instructions: customInstructions,
    },
  );
}

/** Read a file from a sandbox workspace. Returns raw bytes. */
export async function readWorkspaceFile(
  workspaceId: string,
  filename: string,
): Promise<Uint8Array> {
  if (!isTauri()) {
    throw new Error("readWorkspaceFile is only available in Tauri");
  }
  const bytes = await tauriInvoke<number[]>("read_workspace_file", {
    workspaceId,
    filename,
  });
  return new Uint8Array(bytes);
}

export type SaveFileOptions = {
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
};

/** Save binary data to disk. Tauri: uses dialog + fs. Web: Blob download. */
export async function saveFile(
  data: Uint8Array | string,
  name: string,
  options?: SaveFileOptions,
): Promise<void> {
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({
      defaultPath: options?.defaultPath ?? name,
      filters: options?.filters,
    });
    if (path) {
      const bytes =
        typeof data === "string" ? new TextEncoder().encode(data) : data;
      await writeFile(path, bytes);
    }
    return;
  }

  // Web fallback – create a temporary download link
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: "text/plain" })
      : new Blob([data.buffer as ArrayBuffer]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export type PickFilesOptions = {
  multiple?: boolean;
  accept?: string[];
};

function guessMimeType(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "csv":
      return "text/csv";
    case "css":
      return "text/css";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "gif":
      return "image/gif";
    case "html":
      return "text/html";
    case "jpeg":
    case "jpg":
      return "image/jpeg";
    case "js":
    case "mjs":
      return "text/javascript";
    case "json":
      return "application/json";
    case "md":
      return "text/markdown";
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case "py":
      return "text/x-python";
    case "svg":
      return "image/svg+xml";
    case "ts":
    case "tsx":
      return "text/typescript";
    case "txt":
      return "text/plain";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "xml":
      return "application/xml";
    case "yaml":
    case "yml":
      return "application/yaml";
    default:
      return "application/octet-stream";
  }
}

/** Open a file picker and return a FileList. */
export async function pickFiles(
  options?: PickFilesOptions,
): Promise<FileList | null> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readFile } = await import("@tauri-apps/plugin-fs");

    const selected = await open({
      multiple: options?.multiple ?? true,
      filters: options?.accept
        ? [{ name: "Files", extensions: options.accept }]
        : undefined,
    });
    if (!selected) return null;

    const paths = Array.isArray(selected) ? selected : [selected];
    const dt = new DataTransfer();
    for (const p of paths) {
      const bytes = await readFile(p);
      const name = p.split(/[/\\]/).pop() ?? "file";
      const file = new File([bytes], name, { type: guessMimeType(name) });
      Object.defineProperty(file, "path", {
        value: p,
        configurable: true,
      });
      dt.items.add(file);
    }
    return dt.files;
  }

  // Web fallback – use an invisible <input type="file">
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = options?.multiple ?? true;
    if (options?.accept) {
      input.accept = options.accept.join(",");
    }
    input.onchange = () => resolve(input.files);
    input.click();
  });
}
