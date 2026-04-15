/**
 * Platform abstraction for Tauri / Web file operations.
 *
 * All Tauri imports are lazy (dynamic) so that this module can be loaded
 * in a plain browser without the @tauri-apps packages being present.
 */

import type { ToolCall, ToolResult } from "./types";
import { DEFAULT_API_BASE_URL, type AuthState } from "./auth";

/** Detect whether we are running inside a Tauri webview. */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

export function isTauriMacOS(): boolean {
  return (
    isTauri() &&
    typeof navigator !== "undefined" &&
    /Mac/i.test(navigator.userAgent)
  );
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

  return (import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL)
    .trim()
    .replace(/\/+$/, "");
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
