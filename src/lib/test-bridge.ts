import type { AuthState } from "./auth";
import type { AgentChunk, ModelInfo } from "./types";
import type { ProjectContext, ProjectEntry } from "./tauri-bridge";

export const TEST_MODE_STORAGE_KEY = "__tachyon_test_mode";

export type TachyonTestBridgeState = {
  auth: AuthState | null;
  activeProject: ProjectEntry | null;
  recentProjects: ProjectEntry[];
  projectContext: ProjectContext | null;
  sessionId: string | null;
  chunks: AgentChunk[];
  isLoading: boolean;
  error: { kind: string; message: string } | null;
  selectedModel: string;
  availableModels: ModelInfo[] | null;
  mcpToolNames: string[];
  pathname: string;
  canvasOpen: boolean;
  artifactPanelOpen: boolean;
};

export type TachyonTestBridge = {
  version: string;
  getState: () => TachyonTestBridgeState;
  setAuth: (auth: AuthState | null) => void;
  activateProject: (path: string) => Promise<void>;
  sendMessage: (message: string, taskOverride?: string) => Promise<void>;
  newChat: () => void;
  setSelectedModel: (modelId: string) => void;
  clearError: () => void;
};

declare global {
  interface Window {
    __tachyonTestBridge?: TachyonTestBridge;
  }
}

export function shouldEnableTestBridge(): boolean {
  if (typeof window === "undefined") return false;
  if (!("__TAURI__" in window)) return false;

  if (import.meta.env.DEV) {
    return true;
  }

  try {
    return window.localStorage.getItem(TEST_MODE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
