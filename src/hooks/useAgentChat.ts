import { useCallback, useEffect, useRef, useState } from "react";
import { AgentChatClient } from "../lib/api-client";
import type {
  AgentChunk,
  AgentExecuteRequest,
  Artifact,
  ClientToolDefinition,
  InlineAttachment,
  SessionSummary,
  ToolCall,
} from "../lib/types";
import {
  executeClientTool,
  isTauri,
  type ProjectContext,
} from "../lib/tauri-bridge";
import { DEFAULT_MODEL_ID } from "../lib/models";
import {
  chunkToArtifact,
  isFileWriteTool,
  fileWriteToArtifact,
  workspaceFilesToArtifacts,
} from "./useArtifact";

const MODEL_KEY = "tachyon-cowork-model";
const PINNED_KEY = "tachyon-cowork-pinned";
const SESSION_PROJECTS_KEY = "tachyon-cowork-session-projects";

/** Streaming timeout: abort if no data received for this duration (ms) */
const STREAM_TIMEOUT_MS = 90_000;

/** Max retry attempts for transient errors */
const MAX_RETRIES = 2;

/** Base delay for exponential backoff (ms) */
const RETRY_BASE_DELAY_MS = 1_000;

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  // Retry on network errors and 5xx server errors
  return (
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("aborted") ||
    /\b5\d{2}\b/.test(msg)
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNetworkErrorMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror") ||
    normalized.includes("network error") ||
    normalized.includes("network request failed") ||
    normalized.includes("fetch failed") ||
    normalized.includes("offline") ||
    normalized.includes("econnrefused") ||
    normalized.includes("timed out") ||
    normalized.includes("timeout")
  );
}

export type ChatErrorKind = "network" | "auth" | "server" | "unknown";

export type ChatErrorState = {
  kind: ChatErrorKind;
  message: string;
};

function toChatError(error: unknown): ChatErrorState {
  if (!(error instanceof Error)) {
    return { kind: "unknown", message: String(error) };
  }

  const message = error.message || "Unknown error";
  const normalized = message.toLowerCase();

  if (isNetworkErrorMessage(message)) {
    return {
      kind: "network",
      message:
        "Agent API に接続できません。ネットワークを確認するか、ローカルのファイルツールを利用してください。",
    };
  }

  if (
    normalized.includes("401") ||
    normalized.includes("403") ||
    normalized.includes("unauthorized")
  ) {
    return {
      kind: "auth",
      message: "認証が無効です。再ログインしてから再試行してください。",
    };
  }

  if (
    normalized.includes("500") ||
    normalized.includes("502") ||
    normalized.includes("503") ||
    normalized.includes("504") ||
    normalized.includes("agent execute failed")
  ) {
    return {
      kind: "server",
      message:
        "Agent API が応答できませんでした。少し待ってから再試行してください。",
    };
  }

  return { kind: "unknown", message };
}

function buildClientTools(
  activeProjectPath?: string | null,
): ClientToolDefinition[] {
  const projectNote = activeProjectPath
    ? ` Relative paths are resolved from the current project directory: ${activeProjectPath}. Use the selected project directory directly unless the user specifies another location.`
    : " No current project directory is selected yet; prompt the user to choose one before filesystem work.";

  return [
    {
      name: "canvas",
      description:
        "Open a canvas to display and edit a document with live preview. Use this when creating HTML pages, React components, or any visual content the user wants to see rendered.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Document title.",
          },
          content: {
            type: "string",
            description:
              "Full document content. For HTML: a complete HTML document. For JSX: a React component with a default export.",
          },
          content_type: {
            type: "string",
            enum: ["html", "jsx"],
            description:
              "Content type: 'html' for HTML documents, 'jsx' for React JSX components.",
          },
        },
        required: ["title", "content", "content_type"],
        additionalProperties: false,
      },
    },
    {
      name: "local_list_directory",
      description:
        "List files and subdirectories in a local directory on this device. Use this to inspect what exists inside a folder before reading or processing files." +
        projectNote,
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Absolute path of the local directory to inspect.",
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
    {
      name: "local_search_files",
      description:
        "Search for files inside a local directory on this device by filename and optional extension filters." +
        projectNote,
      parameters: {
        type: "object",
        properties: {
          directory: {
            type: "string",
            description:
              "Absolute path of the local directory to search inside.",
          },
          pattern: {
            type: "string",
            description:
              "Case-insensitive substring to match against filenames.",
          },
          extensions: {
            type: "array",
            items: { type: "string" },
            description:
              "Optional file extensions to include, without dots if possible.",
          },
          max_results: {
            type: "integer",
            description: "Maximum number of matches to return.",
          },
          recursive: {
            type: "boolean",
            description: "Whether to include subdirectories in the search.",
          },
          include_hidden: {
            type: "boolean",
            description: "Whether to include hidden files and folders.",
          },
        },
        required: ["directory"],
        additionalProperties: false,
      },
    },
    {
      name: "local_get_file_info",
      description:
        "Get metadata for a local file or directory on this device, including size, timestamps, type, and extension." +
        projectNote,
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Absolute path of the local file or directory.",
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
    {
      name: "execute_code",
      description:
        "Execute code in a sandboxed microVM environment. Supports Python, JavaScript (Node.js), and Shell. The code runs in complete isolation with no network access. Use this when the user asks to run, execute, or test code.",
      parameters: {
        type: "object",
        properties: {
          language: {
            type: "string",
            enum: ["python", "javascript", "shell"],
            description: "Programming language to execute.",
          },
          code: {
            type: "string",
            description: "Source code to execute.",
          },
          timeout_secs: {
            type: "integer",
            description:
              "Execution timeout in seconds (default: 30, max: 300).",
          },
        },
        required: ["language", "code"],
        additionalProperties: false,
      },
    },
    {
      name: "generate_file",
      description:
        "Generate a document file (PDF, DOCX, or PPTX) using Python libraries in a sandboxed environment. The data object specifies the document content structure. Any output_path must point to a real host path inside the current project; do not use sandbox-only paths like /workspace." +
        projectNote,
      parameters: {
        type: "object",
        properties: {
          file_type: {
            type: "string",
            enum: ["pdf", "docx", "pptx"],
            description: "Type of file to generate.",
          },
          data: {
            type: "object",
            description:
              "Document content. Common fields: title (string), content (string), sections (array of {heading, body}). For PPTX: slides (array of {title, content, bullets}). For DOCX: tables (array of {headers, rows}).",
          },
          output_path: {
            type: "string",
            description:
              "Optional host filesystem path to save the generated file. Relative paths resolve from the current project workspace; never use sandbox-only paths like /workspace.",
          },
        },
        required: ["file_type", "data"],
        additionalProperties: false,
      },
    },
    {
      name: "pdf_read",
      description:
        "Read and extract text content from a PDF file on this device. Returns page-by-page text and metadata (title, author)." +
        projectNote,
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Absolute path of the PDF file to read.",
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
    {
      name: "docx_read",
      description:
        "Read and extract content from a Word document (.docx) on this device. Returns paragraphs with styles, tables, and metadata." +
        projectNote,
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Absolute path of the DOCX file to read.",
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
    // ── Host filesystem tools (runs on host OS, restricted to home dir) ──
    {
      name: "host_read_file",
      description:
        "Read a file from the host filesystem inside the active project directory. Returns text content or base64-encoded binary. Use this for reading config files, scripts, data files, etc." +
        projectNote,
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "Absolute path of the file to read (must be within home directory).",
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
    {
      name: "host_write_file",
      description:
        "Write content to a file on the host filesystem inside the active project directory. Use this for saving config files, scripts, data files, etc." +
        projectNote,
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "Absolute path to write the file (must be within home directory).",
          },
          content: {
            type: "string",
            description:
              "File content as text, or base64-encoded string if is_base64 is true.",
          },
          is_base64: {
            type: "boolean",
            description: "If true, content is base64-encoded binary data.",
          },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
    },
    {
      name: "host_list_dir",
      description:
        "List the contents of a directory on the host filesystem inside the active project directory." +
        projectNote,
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "Absolute path of the directory to list (must be within home directory).",
          },
          show_hidden: {
            type: "boolean",
            description: "If true, include hidden files (starting with '.').",
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
    {
      name: "host_execute_command",
      description:
        "Execute a safe, allow-listed command on the host OS. Only specific commands are permitted: ls, stat, file, du, wc, find, which, cat, head, tail, grep, sort, uniq, diff, tar, zip, unzip, date, echo, pwd, basename, dirname, realpath. The default working directory is the active project directory." +
        projectNote,
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "Command name from the allow-list.",
          },
          args: {
            type: "array",
            items: { type: "string" },
            description: "Command arguments.",
          },
          working_dir: {
            type: "string",
            description:
              "Working directory for the command (must be within home directory, defaults to home).",
          },
        },
        required: ["command"],
        additionalProperties: false,
      },
    },
  ];
}

function buildAgentCustomInstructions(
  activeProjectPath?: string | null,
  activeProjectContext?: ProjectContext | null,
): string {
  const sections = [
    "Use available client_tools proactively whenever they can reduce guessing or avoid asking the user for information you can inspect yourself.",
    "Prefer client_tools for current local and project state: listing directories, searching files, reading files, inspecting metadata, reading PDFs or DOCX files, running safe host commands, and executing sandbox code.",
    "Before answering questions about the current local environment, project contents, or generated files, inspect them with a relevant client tool whenever possible.",
    "Do not claim you checked local files, folders, commands, or document contents unless you actually used a client tool to inspect them.",
    activeProjectPath
      ? `Current project directory: ${activeProjectPath}`
      : "No current project directory is selected. If project-relative filesystem work is needed and the path is unclear, ask the user to select a project first.",
    activeProjectPath
      ? "Work directly in the selected project directory by default. Do not create or prefer a separate scratch workspace unless the user explicitly asks for one."
      : null,
    activeProjectContext?.is_initialized
      ? "This project has project-specific custom instructions. Follow them unless the user overrides them."
      : null,
    activeProjectContext?.prompt_context?.trim()
      ? activeProjectContext.prompt_context.trim()
      : null,
  ].filter(Boolean);

  return sections.join("\n\n");
}

function mergeChunkText(
  currentValue: string | undefined,
  nextValue: string | undefined,
): string | undefined {
  if (!nextValue) return currentValue;
  if (!currentValue) return nextValue;
  if (nextValue.startsWith(currentValue)) return nextValue;
  if (currentValue.endsWith(nextValue)) return currentValue;
  return `${currentValue}${nextValue}`;
}

function mergeChunk(existing: AgentChunk, incoming: AgentChunk): AgentChunk {
  return {
    ...existing,
    ...incoming,
    text: mergeChunkText(existing.text, incoming.text),
    content: mergeChunkText(existing.content, incoming.content),
    thinking: mergeChunkText(existing.thinking, incoming.thinking),
    tool_arguments: mergeChunkText(
      existing.tool_arguments,
      incoming.tool_arguments,
    ),
    tool_result: mergeChunkText(existing.tool_result, incoming.tool_result),
    result: mergeChunkText(existing.result, incoming.result),
  };
}

function getChunkSourceId(chunk: AgentChunk): string {
  return chunk.id || chunk.tool_id || chunk.created_at || "unknown";
}

type ChunkGroup =
  | "assistant"
  | "thinking"
  | "tool"
  | "artifact"
  | "usage"
  | "other";

function getChunkGroup(chunk: AgentChunk): ChunkGroup {
  switch (chunk.type) {
    case "assistant":
    case "say":
    case "attempt_completion":
    case "completion":
      return "assistant";
    case "thinking":
      return "thinking";
    case "tool_call":
    case "tool_call_args":
    case "tool_call_pending":
    case "tool_result":
      return "tool";
    case "artifact":
      return "artifact";
    case "usage":
      return "usage";
    default:
      return "other";
  }
}

type StreamScopeState = {
  assistantSegment: number;
  lastGroup: ChunkGroup | null;
};

function getChunkStreamKey(
  chunk: AgentChunk,
  streamState?: StreamScopeState,
): string {
  switch (chunk.type) {
    case "assistant":
    case "say":
    case "attempt_completion":
    case "completion":
      return `${chunk.type}:${getChunkSourceId(chunk)}:${streamState?.assistantSegment ?? 0}`;
    case "thinking":
      return "thinking";
    case "tool_call":
    case "tool_call_args":
    case "tool_call_pending":
      return `tool-call:${chunk.tool_id || chunk.tool_name || getChunkSourceId(chunk)}`;
    case "tool_result":
      return `tool-result:${chunk.tool_id || chunk.tool_name || getChunkSourceId(chunk)}`;
    case "artifact":
      return `artifact:${chunk.artifact_id || chunk.filename || getChunkSourceId(chunk)}`;
    case "usage":
      return "usage";
    default:
      return `${chunk.type}:${getChunkSourceId(chunk)}`;
  }
}

function withStreamScopedId(
  incoming: AgentChunk,
  mergeableKeys: Map<string, string>,
  streamInstanceId: string,
  streamState: StreamScopeState,
): AgentChunk {
  const group = getChunkGroup(incoming);
  if (group === "assistant" && streamState.lastGroup !== "assistant") {
    streamState.assistantSegment += 1;
  }

  const mergeKey = getChunkStreamKey(incoming, streamState);
  const existingId = mergeableKeys.get(mergeKey);
  streamState.lastGroup = group;

  if (existingId) {
    return { ...incoming, id: existingId };
  }

  const sourceId = getChunkSourceId(incoming) || `chunk-${mergeableKeys.size}`;
  const scopedId = `${sourceId}::${streamInstanceId}::${mergeableKeys.size}`;
  mergeableKeys.set(mergeKey, scopedId);
  return { ...incoming, id: scopedId };
}

function upsertChunk(prev: AgentChunk[], incoming: AgentChunk): AgentChunk[] {
  const existingIndex = prev.findIndex((chunk) => chunk.id === incoming.id);
  if (existingIndex === -1) {
    return [...prev, incoming];
  }

  const next = [...prev];
  next[existingIndex] = mergeChunk(prev[existingIndex], incoming);
  return next;
}

function resolvePendingToolCall(
  prev: AgentChunk[],
  toolId: string,
): AgentChunk[] {
  return prev.map((chunk) => {
    if (chunk.type !== "tool_call_pending" || chunk.tool_id !== toolId) {
      return chunk;
    }
    return {
      ...chunk,
      type: "tool_call",
      is_finished: true,
    };
  });
}

function isToolCallChunk(chunk: AgentChunk): boolean {
  return (
    chunk.type === "tool_call" ||
    chunk.type === "tool_call_args" ||
    chunk.type === "tool_call_pending"
  );
}

function normalizeLoadedChunks(chunks: AgentChunk[]): AgentChunk[] {
  const compacted: AgentChunk[] = [];

  for (const chunk of chunks) {
    const normalized = normalizeIncomingChunk(chunk);
    const previous = compacted[compacted.length - 1];

    if (
      previous &&
      previous.tool_id &&
      normalized.tool_id &&
      previous.tool_id === normalized.tool_id &&
      isToolCallChunk(previous) &&
      isToolCallChunk(normalized)
    ) {
      compacted[compacted.length - 1] = mergeChunk(previous, normalized);
      continue;
    }

    compacted.push(normalized);
  }

  const completedToolIds = new Set(
    compacted
      .filter(
        (chunk) =>
          !!chunk.tool_id &&
          (chunk.type === "tool_result" || chunk.type === "tool_call"),
      )
      .map((chunk) => chunk.tool_id!),
  );

  return compacted.map((chunk) => {
    if (
      chunk.type === "tool_call_pending" &&
      chunk.tool_id &&
      completedToolIds.has(chunk.tool_id)
    ) {
      return {
        ...chunk,
        type: "tool_call",
        is_finished: true,
      };
    }

    return chunk;
  });
}

function extractSseEvents(buffer: string): {
  events: string[];
  rest: string;
} {
  const parts = buffer.split(/\r?\n\r?\n/);
  const rest = parts.pop() ?? "";
  return { events: parts, rest };
}

function parseSseEvent(eventBlock: string): string | null {
  const data = eventBlock
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
    .trim();

  return data || null;
}

function stringifyToolPayload(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function normalizeIncomingChunk(chunk: AgentChunk): AgentChunk {
  if (chunk.type !== "tool_call_pending" || !chunk.args) {
    return chunk;
  }

  return {
    ...chunk,
    tool_arguments: chunk.tool_arguments ?? stringifyToolPayload(chunk.args),
  };
}

function loadPinnedRooms(): string[] {
  try {
    const raw = localStorage.getItem(PINNED_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

function savePinnedRooms(ids: string[]): void {
  localStorage.setItem(PINNED_KEY, JSON.stringify(ids));
}

function loadSessionProjectMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SESSION_PROJECTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

function saveSessionProjectMap(mapping: Record<string, string>): void {
  localStorage.setItem(SESSION_PROJECTS_KEY, JSON.stringify(mapping));
}

function attachProjectPaths(
  sessions: SessionSummary[],
  mapping: Record<string, string>,
): SessionSummary[] {
  return sessions.map((session) => ({
    ...session,
    project_path: mapping[session.id],
  }));
}

export type CanvasToolCallArgs = {
  title: string;
  content: string;
  content_type: "html" | "jsx";
};

export function useAgentChat(
  client: AgentChatClient | null,
  onArtifact?: (artifact: Artifact) => void,
  onCanvasToolCall?: (args: CanvasToolCallArgs) => void,
  mcpTools?: ClientToolDefinition[],
  activeProjectPath?: string | null,
  activeProjectContext?: ProjectContext | null,
) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [chunks, setChunks] = useState<AgentChunk[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ChatErrorState | null>(null);
  const [input, setInput] = useState("");
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [pinnedRooms, setPinnedRooms] = useState<string[]>(loadPinnedRooms);
  const [selectedModel, setSelectedModel] = useState<string>(
    () => localStorage.getItem(MODEL_KEY) ?? DEFAULT_MODEL_ID,
  );
  const abortRef = useRef<AbortController | null>(null);
  const skipNextSessionLoadRef = useRef<string | null>(null);
  const lastMessageRef = useRef<{
    message: string;
    task: string;
    attachments?: InlineAttachment[];
  } | null>(null);

  const handlePendingToolCall = useCallback(
    async (
      currentSessionId: string,
      chunk: AgentChunk & { args?: Record<string, unknown> },
    ) => {
      if (!client || !chunk.tool_id || !chunk.tool_name) return;

      let resultText: string;

      // Handle canvas tool call on the client side (no Tauri needed)
      if (chunk.tool_name === "canvas") {
        try {
          const args = chunk.args as unknown as CanvasToolCallArgs;
          if (onCanvasToolCall) {
            onCanvasToolCall(args);
          }
          resultText = stringifyToolPayload({
            ok: true,
            message: `Canvas opened: ${args.title}`,
          });
        } catch (error) {
          resultText = stringifyToolPayload({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      } else {
        try {
          if (!isTauri()) {
            throw new Error(
              "client-side local filesystem tools are only available in the Tauri app",
            );
          }
          const toolCall: ToolCall = {
            name: chunk.tool_name,
            arguments: chunk.args ?? {},
          };
          const outcome = await executeClientTool(toolCall);
          resultText = stringifyToolPayload(
            outcome.error
              ? { ok: false, error: outcome.error, result: outcome.result }
              : outcome.result,
          );

          // Detect workspace files and create artifacts for download
          if (
            onArtifact &&
            outcome.result &&
            typeof outcome.result === "object"
          ) {
            const res = outcome.result as Record<string, unknown>;
            const wsId = res.workspace_id as string | undefined;
            const wsFiles = res.workspace_files as
              | { name: string; path: string; size: number; is_dir: boolean }[]
              | undefined;
            if (wsId && wsFiles && wsFiles.length > 0) {
              const now = new Date().toISOString();
              const artifacts = workspaceFilesToArtifacts(wsId, wsFiles, now);
              for (const a of artifacts) {
                onArtifact(a);
              }
            }
          }
        } catch (error) {
          resultText = stringifyToolPayload({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (chunk.fire_and_forget) return;
      try {
        await client.submitToolResult(currentSessionId, {
          tool_id: chunk.tool_id,
          result: resultText,
          is_finished: true,
        });
      } catch (error) {
        console.error("Failed to submit tool result:", {
          sessionId: currentSessionId,
          toolId: chunk.tool_id,
          toolName: chunk.tool_name,
          resultText,
          error,
        });
        throw error;
      }
      setChunks((prev) => resolvePendingToolCall(prev, chunk.tool_id!));
    },
    [client, onCanvasToolCall, onArtifact],
  );

  useEffect(() => {
    localStorage.setItem(MODEL_KEY, selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    if (!sessionId || !client) {
      setChunks([]);
      setIsLoading(false);
      return;
    }
    if (skipNextSessionLoadRef.current === sessionId) {
      skipNextSessionLoadRef.current = null;
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    client
      .getMessages(sessionId)
      .then((messages) => {
        if (!cancelled) {
          setChunks(normalizeLoadedChunks(messages));
          setIsLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setChunks([]);
          setError(toChatError(e));
          setIsLoading(false);
        }
        console.error("Failed to fetch session messages:", e);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, client]);

  const fetchSessions = useCallback(async () => {
    if (!client) return;
    try {
      const items = await client.getSessions();
      setSessions(attachProjectPaths(items, loadSessionProjectMap()));
      setSessionId((prev) => {
        if (prev && items.some((item) => item.id === prev)) {
          return prev;
        }
        return items[0]?.id ?? null;
      });
    } catch (e) {
      console.error("Failed to fetch sessions:", e);
    }
  }, [client]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const startTask = useCallback(
    async (
      task: string,
      newRoomTitle?: string,
      attachments?: InlineAttachment[],
    ) => {
      if (!client) return;
      setIsLoading(true);
      setError(null);

      let currentSessionId = sessionId;
      if (!currentSessionId) {
        try {
          const session = await client.createSession(
            newRoomTitle || task.slice(0, 50),
          );
          currentSessionId = session.session.id;
          if (activeProjectPath) {
            const mapping = loadSessionProjectMap();
            mapping[currentSessionId] = activeProjectPath;
            saveSessionProjectMap(mapping);
          }
          skipNextSessionLoadRef.current = currentSessionId;
          setSessionId(currentSessionId);
          setSessions((prev) =>
            attachProjectPaths(
              [
                {
                  id: session.session.id,
                  name: session.session.name,
                  created_at: new Date().toISOString(),
                },
                ...prev,
              ],
              loadSessionProjectMap(),
            ),
          );
        } catch (e) {
          setError(toChatError(e));
          setIsLoading(false);
          return;
        }
      }

      if (abortRef.current) abortRef.current.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const streamInstanceId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const mergeableStreamKeys = new Map<string, string>();
      const streamScopeState: StreamScopeState = {
        assistantSegment: 0,
        lastGroup: null,
      };
      let receivedStreamChunk = false;

      // Track server-side tool_call metadata so we can detect file-write results
      const toolCallMeta = new Map<
        string,
        { toolName: string; toolArguments: string }
      >();

      const trackToolCall = (chunk: AgentChunk) => {
        if (!chunk.tool_id) return;
        if (
          (chunk.type === "tool_call" ||
            chunk.type === "tool_call_args" ||
            chunk.type === "tool_call_pending") &&
          chunk.tool_name
        ) {
          const existing = toolCallMeta.get(chunk.tool_id);
          if (!existing) {
            toolCallMeta.set(chunk.tool_id, {
              toolName: chunk.tool_name,
              toolArguments: chunk.tool_arguments || "",
            });
          } else {
            if (chunk.tool_arguments) {
              existing.toolArguments =
                mergeChunkText(existing.toolArguments, chunk.tool_arguments) ||
                "";
            }
          }
        } else if (chunk.type === "tool_call_args" && chunk.tool_arguments) {
          const existing = toolCallMeta.get(chunk.tool_id);
          if (existing) {
            existing.toolArguments =
              mergeChunkText(existing.toolArguments, chunk.tool_arguments) ||
              "";
          }
        }
      };

      const detectFileWriteArtifact = (chunk: AgentChunk) => {
        if (chunk.type !== "tool_result" || !chunk.tool_id || !onArtifact)
          return;
        const meta = toolCallMeta.get(chunk.tool_id);
        if (!meta || !isFileWriteTool(meta.toolName)) return;
        const artifact = fileWriteToArtifact(
          chunk.tool_id,
          meta.toolArguments,
          chunk.created_at || new Date().toISOString(),
        );
        if (artifact) onArtifact(artifact);
      };

      const processIncomingChunk = async (
        parsedChunk: AgentChunk & { args?: Record<string, unknown> },
      ) => {
        const normalized = normalizeIncomingChunk(parsedChunk);
        const chunk = withStreamScopedId(
          normalized,
          mergeableStreamKeys,
          streamInstanceId,
          streamScopeState,
        );
        receivedStreamChunk = true;
        setChunks((prev) => upsertChunk(prev, chunk));

        if (chunk.type === "tool_call_pending" && currentSessionId) {
          try {
            await handlePendingToolCall(currentSessionId, parsedChunk);
          } catch (error) {
            const message =
              error instanceof Error
                ? error.message
                : "Tool result submission failed";
            setError({
              kind: "server",
              message: `Tool result の送信に失敗しました: ${message}`,
            });
          }
        }

        if (chunk.type === "artifact" && onArtifact) {
          onArtifact(chunkToArtifact(chunk));
        }
        trackToolCall(chunk);
        detectFileWriteArtifact(chunk);
      };

      const executeWithRetry = async (attempt: number): Promise<void> => {
        try {
          const customInstructions = buildAgentCustomInstructions(
            activeProjectPath,
            activeProjectContext,
          );
          const args: AgentExecuteRequest = {
            task,
            model: selectedModel,
            max_requests: 10,
            use_json_tool_calls: true,
            ...(customInstructions && {
              custom_instructions: customInstructions,
            }),
            client_tools: [
              ...buildClientTools(activeProjectPath),
              ...(mcpTools ?? []),
            ],
            ...(attachments && attachments.length > 0 && { attachments }),
          };
          const response = await client.executeAgent(currentSessionId!, args);
          if (!response.body) throw new Error("Response body is null");

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let streamTimeoutId: ReturnType<typeof setTimeout> | null = null;

          const resetStreamTimeout = () => {
            if (streamTimeoutId) clearTimeout(streamTimeoutId);
            streamTimeoutId = setTimeout(() => {
              ac.abort();
              setError({
                kind: "network",
                message:
                  "Agent API の応答がタイムアウトしました。接続を確認して再試行してください。",
              });
            }, STREAM_TIMEOUT_MS);
          };

          resetStreamTimeout();

          try {
            while (true) {
              if (ac.signal.aborted) break;
              const { done, value } = await reader.read();
              if (done) break;

              resetStreamTimeout();
              buffer += decoder.decode(value, { stream: true });
              const { events, rest } = extractSseEvents(buffer);
              buffer = rest;

              for (const eventBlock of events) {
                const data = parseSseEvent(eventBlock);
                if (!data || data === "[DONE]") continue;
                try {
                  const parsed = JSON.parse(data) as AgentChunk & {
                    args?: Record<string, unknown>;
                  };
                  if ("error" in parsed && parsed.error) {
                    const msg =
                      (parsed.error as { message?: string }).message ??
                      "Unknown error";
                    setError(toChatError(new Error(msg)));
                    continue;
                  }
                  await processIncomingChunk(parsed);
                } catch (error) {
                  if (error instanceof SyntaxError) {
                    // skip malformed JSON
                    continue;
                  }
                  console.error("Failed to process SSE chunk:", error);
                }
              }
            }
          } finally {
            if (streamTimeoutId) clearTimeout(streamTimeoutId);
          }

          const finalData = parseSseEvent(buffer);
          if (finalData && finalData !== "[DONE]") {
            try {
              const parsed = JSON.parse(finalData) as AgentChunk & {
                args?: Record<string, unknown>;
              };
              await processIncomingChunk(parsed);
            } catch (error) {
              if (error instanceof SyntaxError) {
                // ignore trailing partial event
              } else {
                console.error("Failed to process trailing SSE chunk:", error);
              }
            }
          }
        } catch (e) {
          if (e instanceof Error && e.name === "AbortError") throw e;
          // Retry on transient errors if we haven't received any chunks yet
          if (
            !receivedStreamChunk &&
            attempt < MAX_RETRIES &&
            isRetryableError(e)
          ) {
            const backoff = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
            await delay(backoff);
            if (!ac.signal.aborted) {
              return executeWithRetry(attempt + 1);
            }
          }
          throw e;
        }
      };

      try {
        await executeWithRetry(0);
      } catch (e) {
        if (e instanceof Error && e.name !== "AbortError") {
          setError(toChatError(e));
        }
      } finally {
        setIsLoading(false);
        if (abortRef.current === ac) abortRef.current = null;

        if (currentSessionId) {
          try {
            if (!receivedStreamChunk) {
              const msgs = await client.getMessages(currentSessionId);
              if (msgs.length > 0) {
                setChunks(normalizeLoadedChunks(msgs));
              }
            }
          } catch {
            /* ignore */
          }
        }
      }
    },
    [
      sessionId,
      client,
      selectedModel,
      onArtifact,
      handlePendingToolCall,
      mcpTools,
      activeProjectPath,
      activeProjectContext,
    ],
  );

  const sendMessage = useCallback(
    async (
      message: string,
      attachments?: InlineAttachment[],
      taskOverride?: string,
    ) => {
      const trimmed = message.trim();
      const hasAttachments = attachments && attachments.length > 0;
      if ((!trimmed && !hasAttachments) || isLoading) return;

      // Build preview data URLs for image attachments to display in user bubble
      const imageUrls =
        attachments
          ?.filter((a) => a.content_type.startsWith("image/"))
          .map((a) => `data:${a.content_type};base64,${a.data}`) ?? undefined;

      const userChunk: AgentChunk = {
        type: "user",
        id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        text: trimmed,
        created_at: new Date().toISOString(),
        ...(imageUrls && imageUrls.length > 0 && { imageUrls }),
      };
      setChunks((prev) => [...prev, userChunk]);
      const taskText =
        (taskOverride ?? trimmed) || "この画像について説明してください";
      lastMessageRef.current = { message, task: taskText, attachments };
      // Backend requires a non-empty task; use default for image-only sends
      await startTask(taskText, undefined, attachments);
    },
    [isLoading, startTask],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim() || isLoading) return;
      const msg = input.trim();
      setInput("");
      await sendMessage(msg);
    },
    [input, isLoading, sendMessage],
  );

  const deleteMessage = useCallback(
    (chunkId: string) => {
      setChunks((prev) => prev.filter((c) => c.id !== chunkId));
      if (client && sessionId) {
        client.deleteMessage(sessionId, chunkId).catch((e) => {
          console.error("Failed to delete message from server:", e);
        });
      }
    },
    [client, sessionId],
  );

  const retry = useCallback(async () => {
    if (isLoading) return;

    // Find the last user message
    let lastUserIndex = -1;
    for (let i = chunks.length - 1; i >= 0; i--) {
      if (chunks[i].type === "user") {
        lastUserIndex = i;
        break;
      }
    }
    if (lastUserIndex === -1) return;

    const lastUserChunk = chunks[lastUserIndex];
    const userText = lastUserChunk.text || "";

    // Remove all chunks after the last user message
    setChunks((prev) => prev.slice(0, lastUserIndex + 1));

    await startTask(userText);
  }, [isLoading, chunks, startTask]);

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setChunks([]);
    setError(null);
    setIsLoading(false);
    setInput("");
    setSessionId(null);
  }, []);

  const selectSession = useCallback(
    (id: string) => {
      if (id === sessionId) return;
      abortRef.current?.abort();
      abortRef.current = null;
      setChunks([]);
      setError(null);
      setIsLoading(false);
      setInput("");
      setSessionId(id);
    },
    [sessionId],
  );

  const deleteRoom = useCallback(
    async (id: string) => {
      if (!client) return;
      try {
        await client.deleteSession(id);
        const mapping = loadSessionProjectMap();
        if (mapping[id]) {
          delete mapping[id];
          saveSessionProjectMap(mapping);
        }
        setSessions((prev) => prev.filter((r) => r.id !== id));
        if (sessionId === id) newChat();
      } catch (e) {
        console.error("Failed to delete session:", e);
      }
    },
    [client, sessionId, newChat],
  );

  const togglePin = useCallback((roomId: string) => {
    setPinnedRooms((prev) => {
      const next = prev.includes(roomId)
        ? prev.filter((id) => id !== roomId)
        : [...prev, roomId];
      savePinnedRooms(next);
      return next;
    });
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const retryLastMessage = useCallback(async () => {
    if (!lastMessageRef.current || isLoading) return;
    setError(null);
    const { task, attachments } = lastMessageRef.current;
    await startTask(task, undefined, attachments);
  }, [isLoading, startTask]);

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
  }, []);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  return {
    sessionId,
    chunks,
    isLoading,
    error,
    input,
    setInput,
    selectedModel,
    setSelectedModel,
    sessions,
    pinnedRooms,
    togglePin,
    handleSubmit,
    sendMessage,
    retry,
    deleteMessage,
    newChat,
    selectSession,
    deleteRoom,
    fetchSessions,
    clearError,
    retryLastMessage,
    stopGeneration,
  };
}
