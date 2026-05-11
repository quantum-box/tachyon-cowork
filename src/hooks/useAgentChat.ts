import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { AgentChatClient, isUnauthorizedApiError } from "../lib/api-client";
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

function waitForNextPaint(): Promise<void> {
  if (typeof requestAnimationFrame === "function") {
    return new Promise((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }
  return delay(0);
}

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
    normalized.includes("agent execute failed") ||
    normalized.includes("execution_error") ||
    normalized.includes("failed to start agent execution")
  ) {
    return {
      kind: "server",
      message: normalized.includes("failed to start agent execution")
        ? message
        : "Agent API が応答できませんでした。少し待ってから再試行してください。",
    };
  }

  return { kind: "unknown", message };
}

function buildClientTools(
  activeProjectPath?: string | null,
): ClientToolDefinition[] {
  const projectNote = activeProjectPath
    ? ` 相対パスは現在の連携フォルダ ${activeProjectPath} から解決されます。ユーザーが別の場所を指定しない限り、選択中の連携フォルダをそのまま使ってください。`
    : " 現在の連携フォルダは未選択です。ファイル操作にフォルダが必要で場所が不明な場合は、先にフォルダ選択を促してください。";

  return [
    {
      name: "canvas",
      description:
        "ライブプレビュー付きのキャンバスを開き、ドキュメントを表示・編集します。HTMLページ、Reactコンポーネント、その他ユーザーが表示確認したい視覚的な成果物を作るときに使ってください。",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "ドキュメントのタイトル。",
          },
          content: {
            type: "string",
            description:
              "ドキュメント本文全体。HTML の場合は完全な HTML ドキュメント、JSX の場合は default export を持つ React コンポーネントにしてください。",
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
            description: "実行するプログラミング言語。",
          },
          code: {
            type: "string",
            description: "実行するソースコード。",
          },
          timeout_secs: {
            type: "integer",
            description:
              "実行タイムアウト秒数（デフォルト: 30、最大: 300）。",
          },
        },
        required: ["language", "code"],
        additionalProperties: false,
      },
    },
    {
      name: "generate_file",
      description:
        "サンドボックス環境の Python ライブラリを使って、PDF、DOCX、PPTX などのドキュメントファイルを生成します。data オブジェクトで文書構造を指定します。output_path は現在の連携フォルダ内にある実際のホストパスを指定し、/workspace のようなサンドボックス専用パスは使わないでください。" +
        projectNote,
      parameters: {
        type: "object",
        properties: {
          file_type: {
            type: "string",
            enum: ["pdf", "docx", "pptx"],
            description: "生成するファイル種別。",
          },
          data: {
            type: "object",
            description:
              "文書内容。共通フィールドは title（文字列）、content（文字列）、sections（{heading, body} の配列）。PPTX は slides（{title, content, bullets} の配列）、DOCX は tables（{headers, rows} の配列）。",
          },
          output_path: {
            type: "string",
            description:
              "生成ファイルの保存先となる任意のホストファイルシステムパス。相対パスは現在の連携フォルダから解決されます。/workspace のようなサンドボックス専用パスは使わないでください。",
          },
        },
        required: ["file_type", "data"],
        additionalProperties: false,
      },
    },
    {
      name: "pdf_read",
      description:
        "この端末上の PDF ファイルを読み取り、テキストを抽出します。ページごとのテキストとメタデータ（タイトル、作成者）を返します。" +
        projectNote,
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "読み取る PDF ファイルの絶対パス。",
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
    {
      name: "docx_read",
      description:
        "この端末上の Word 文書（.docx）を読み取り、内容を抽出します。スタイル付き段落、表、メタデータを返します。" +
        projectNote,
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "読み取る DOCX ファイルの絶対パス。",
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
    // ホストファイルシステムツール（ホストOS上で実行、ホームディレクトリ内に制限）
    {
      name: "host_read_file",
      description:
        "ホストファイルシステム上の現在の連携フォルダ内にあるファイルを読み取ります。テキスト内容または base64 エンコード済みバイナリを返します。設定ファイル、スクリプト、データファイルなどの読み取りに使ってください。" +
        projectNote,
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "読み取るファイルの絶対パス（ホームディレクトリ内である必要があります）。",
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
    {
      name: "host_write_file",
      description:
        "ホストファイルシステム上の現在の連携フォルダ内にファイルを書き込みます。設定ファイル、スクリプト、データファイルなどの保存に使ってください。" +
        projectNote,
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "書き込むファイルの絶対パス（ホームディレクトリ内である必要があります）。",
          },
          content: {
            type: "string",
            description:
              "ファイル内容のテキスト。is_base64 が true の場合は base64 エンコード済み文字列。",
          },
          is_base64: {
            type: "boolean",
            description: "true の場合、content は base64 エンコード済みバイナリデータです。",
          },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
    },
    {
      name: "host_list_dir",
      description:
        "ホストファイルシステム上の現在の連携フォルダ内にあるディレクトリ内容を一覧表示します。" +
        projectNote,
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "一覧表示するディレクトリの絶対パス（ホームディレクトリ内である必要があります）。",
          },
          show_hidden: {
            type: "boolean",
            description: "true の場合、ドットで始まる隠しファイルも含めます。",
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
    {
      name: "host_execute_command",
      description:
        "ホストOS上で安全な許可済みコマンドを実行します。許可されるのは ls, stat, file, du, wc, find, which, cat, head, tail, grep, sort, uniq, diff, tar, zip, unzip, date, echo, pwd, basename, dirname, realpath です。デフォルトの作業ディレクトリは現在の連携フォルダです。" +
        projectNote,
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "許可リスト内のコマンド名。",
          },
          args: {
            type: "array",
            items: { type: "string" },
            description: "コマンド引数。",
          },
          working_dir: {
            type: "string",
            description:
              "コマンドの作業ディレクトリ（ホームディレクトリ内である必要があります。未指定時はホーム）。",
          },
        },
        required: ["command"],
        additionalProperties: false,
      },
    },
  ];
}

function buildAgentCustomInstructions(
  globalCustomInstructions: string,
  activeProjectPath?: string | null,
  activeProjectContext?: ProjectContext | null,
): string {
  const sections = [
    "推測を減らせる場合や、ユーザーに聞かなくても自分で確認できる場合は、利用可能な client_tools を積極的に使ってください。",
    "現在のローカル環境や連携フォルダの状態確認では、ディレクトリ一覧、ファイル検索、ファイル読み取り、メタデータ確認、PDF/DOCX 読み取り、安全なホストコマンド実行、サンドボックスコード実行などに client_tools を優先してください。",
    "現在のローカル環境、ワークスペース内容、生成済みファイルについて答える前に、可能な限り関連する client tool で確認してください。",
    "実際に client tool で確認していないローカルファイル、フォルダ、コマンド、文書内容について、確認済みだと述べないでください。",
    activeProjectPath
      ? `現在の連携フォルダ: ${activeProjectPath}`
      : "現在の連携フォルダは未選択です。フォルダ相対のファイル操作が必要で場所が不明な場合は、先にフォルダ選択を促してください。",
    activeProjectPath
      ? "ユーザーが明示しない限り、選択中の連携フォルダで直接作業してください。別の一時作業場所を優先して作らないでください。"
      : null,
    globalCustomInstructions.trim()
      ? `共通指示:\n${globalCustomInstructions.trim()}`
      : null,
    activeProjectContext?.prompt_context?.trim()
      ? "AGENTS.md 由来のワークスペース指示は、矛盾する場合に共通指示より優先されます。"
      : null,
    activeProjectContext?.prompt_context?.trim()
      ? `AGENTS.md 由来のワークスペース指示:\n${activeProjectContext.prompt_context.trim()}`
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
      return `${chunk.type}:${streamState?.assistantSegment ?? 0}`;
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

function isStreamingTextChunk(chunk: AgentChunk): boolean {
  return (
    chunk.type === "say" ||
    chunk.type === "assistant" ||
    chunk.type === "attempt_completion" ||
    chunk.type === "completion" ||
    chunk.type === "thinking"
  );
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
  if (chunk.type === "error") {
    const messageValue = (chunk as AgentChunk & { message?: unknown }).message;
    const errorMessage =
      typeof messageValue === "string" ? messageValue : undefined;
    return {
      ...chunk,
      id: chunk.id || `error-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      created_at: chunk.created_at || new Date().toISOString(),
      text: chunk.text || errorMessage || "Agent API でエラーが発生しました。",
    };
  }

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
  globalCustomInstructions = "",
  activeProjectPath?: string | null,
  activeProjectContext?: ProjectContext | null,
  maxRequests = 50,
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
  const handledToolSubmissionRef = useRef<Set<string>>(new Set());
  const lastMessageRef = useRef<{
    message: string;
    task: string;
    attachments?: InlineAttachment[];
  } | null>(null);

  const handlePendingToolCall = useCallback(
    async (
      currentSessionId: string,
      chunk: AgentChunk & { args?: Record<string, unknown> },
    ): Promise<Response | null> => {
      if (!client || !chunk.tool_id || !chunk.tool_name) return null;
      const handledKey = `${currentSessionId}:${chunk.tool_id}`;
      if (handledToolSubmissionRef.current.has(handledKey)) {
        return null;
      }
      handledToolSubmissionRef.current.add(handledKey);

      let resultText: string;
      let submitted = false;
      let submitResponse: Response | null = null;

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

      if (chunk.fire_and_forget) return null;
      try {
        submitResponse = await client.submitToolResult(currentSessionId, {
          tool_id: chunk.tool_id,
          result: resultText,
          is_finished: true,
        });
        submitted = true;
      } catch (error) {
        if (isUnauthorizedApiError(error)) {
          throw error;
        }
        console.error("Failed to submit tool result:", {
          sessionId: currentSessionId,
          toolId: chunk.tool_id,
          toolName: chunk.tool_name,
          resultText,
          error,
        });
        throw error;
      } finally {
        if (!submitted) {
          handledToolSubmissionRef.current.delete(handledKey);
        }
      }
      setChunks((prev) => resolvePendingToolCall(prev, chunk.tool_id!));
      return submitResponse;
    },
    [client, onCanvasToolCall, onArtifact],
  );

  useEffect(() => {
    handledToolSubmissionRef.current.clear();
  }, [sessionId]);

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
        if (isUnauthorizedApiError(e)) {
          return;
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
      if (isUnauthorizedApiError(e)) {
        setSessions([]);
        setSessionId(null);
        return;
      }
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
      modelOverride?: string,
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
        if (isStreamingTextChunk(chunk)) {
          flushSync(() => {
            setChunks((prev) => upsertChunk(prev, chunk));
          });
          await waitForNextPaint();
        } else {
          setChunks((prev) => upsertChunk(prev, chunk));
        }

        if (chunk.type === "tool_call_pending" && currentSessionId) {
          try {
            const toolResponse = await handlePendingToolCall(
              currentSessionId,
              parsedChunk,
            );
            if (toolResponse?.body) {
              await consumeAgentStream(toolResponse);
            }
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

      const consumeAgentStream = async (response: Response): Promise<void> => {
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
                if (parsed.type === "error") {
                  const normalized = normalizeIncomingChunk(parsed);
                  setError(toChatError(new Error(normalized.text)));
                  setChunks((prev) => upsertChunk(prev, normalized));
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
            if (parsed.type === "error") {
              const normalized = normalizeIncomingChunk(parsed);
              setError(toChatError(new Error(normalized.text)));
              setChunks((prev) => upsertChunk(prev, normalized));
              return;
            }
            await processIncomingChunk(parsed);
          } catch (error) {
            if (error instanceof SyntaxError) {
              // ignore trailing partial event
            } else {
              console.error("Failed to process trailing SSE chunk:", error);
            }
          }
        }
      };

      const executeWithRetry = async (attempt: number): Promise<void> => {
        try {
          const customInstructions = buildAgentCustomInstructions(
            globalCustomInstructions,
            activeProjectPath,
            activeProjectContext,
          );
          const args: AgentExecuteRequest = {
            task,
            model: modelOverride ?? selectedModel,
            max_requests: maxRequests,
            tool_access: [
              { type: "builtin", name: "web_search" },
              { type: "builtin", name: "url_fetch" },
            ],
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
          await consumeAgentStream(response);
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
      globalCustomInstructions,
      activeProjectPath,
      activeProjectContext,
      maxRequests,
    ],
  );

  const sendMessage = useCallback(
    async (
      message: string,
      attachments?: InlineAttachment[],
      taskOverride?: string,
      modelOverride?: string,
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
      await startTask(taskText, undefined, attachments, modelOverride);
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
