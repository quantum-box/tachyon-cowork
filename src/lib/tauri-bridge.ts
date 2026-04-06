/**
 * Platform abstraction for Tauri / Web file operations.
 */

import { invoke } from "@tauri-apps/api/core";

import type { ToolCall, ToolResult } from "./types";

/** Detect whether we are running inside a Tauri webview. */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
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
export async function executeClientTool(toolCall: ToolCall): Promise<ToolResult> {
  if (!isTauri()) {
    throw new Error("client-side tools are only available in Tauri");
  }
  return invoke<ToolResult>("execute_tool", { toolCall });
}

// ── MCP Types ──────────────────────────────────────────────────────

export type McpTransportConfig =
  | { type: "stdio"; command: string; args: string[]; env: Record<string, string> }
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
  tools: { name: string; description: string; input_schema: Record<string, unknown> }[];
};

// ── MCP Bridge Functions ───────────────────────────────────────────

export async function mcpGetConfig(): Promise<McpConfig> {
  return invoke<McpConfig>("mcp_get_config");
}

export async function mcpAddServer(server: McpServerConfig): Promise<McpConfig> {
  return invoke<McpConfig>("mcp_add_server", { server });
}

export async function mcpRemoveServer(serverId: string): Promise<McpConfig> {
  return invoke<McpConfig>("mcp_remove_server", { serverId });
}

export async function mcpToggleServer(serverId: string, enabled: boolean): Promise<void> {
  return invoke<void>("mcp_toggle_server", { serverId, enabled });
}

export async function mcpGetTools(): Promise<McpToolInfo[]> {
  return invoke<McpToolInfo[]>("mcp_get_tools");
}

export async function mcpGetServerStatuses(): Promise<McpServerStatus[]> {
  return invoke<McpServerStatus[]>("mcp_get_server_statuses");
}

export async function mcpToggleBuiltinApp(appId: string, enabled: boolean): Promise<void> {
  return invoke<void>("mcp_toggle_builtin_app", { appId, enabled });
}

export async function mcpGetBuiltinApps(): Promise<BuiltinAppInfo[]> {
  return invoke<BuiltinAppInfo[]>("mcp_get_builtin_apps");
}

/** Read a file from a sandbox workspace. Returns raw bytes. */
export async function readWorkspaceFile(
  workspaceId: string,
  filename: string,
): Promise<Uint8Array> {
  if (!isTauri()) {
    throw new Error("readWorkspaceFile is only available in Tauri");
  }
  const bytes = await invoke<number[]>("read_workspace_file", { workspaceId, filename });
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
      const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
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

/** Open a file picker and return a FileList. */
export async function pickFiles(options?: PickFilesOptions): Promise<FileList | null> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readFile } = await import("@tauri-apps/plugin-fs");

    const selected = await open({
      multiple: options?.multiple ?? true,
      filters: options?.accept ? [{ name: "Files", extensions: options.accept }] : undefined,
    });
    if (!selected) return null;

    const paths = Array.isArray(selected) ? selected : [selected];
    const dt = new DataTransfer();
    for (const p of paths) {
      const bytes = await readFile(p);
      const name = p.split(/[/\\]/).pop() ?? "file";
      const file = new File([bytes], name);
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
