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
import { executeClientTool, isTauri } from "../lib/tauri-bridge";
import { chunkToArtifact, isFileWriteTool, fileWriteToArtifact } from "./useArtifact";

const MODEL_KEY = "tachyon-cowork-model";
const PINNED_KEY = "tachyon-cowork-pinned";

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

const CLIENT_TOOLS: ClientToolDefinition[] = [
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
          description: "Content type: 'html' for HTML documents, 'jsx' for React JSX components.",
        },
      },
      required: ["title", "content", "content_type"],
      additionalProperties: false,
    },
  },
  {
    name: "local_list_directory",
    description:
      "List files and subdirectories in a local directory on this device. Use this to inspect what exists inside a folder before reading or processing files.",
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
      "Search for files inside a local directory on this device by filename and optional extension filters.",
    parameters: {
      type: "object",
      properties: {
        directory: {
          type: "string",
          description: "Absolute path of the local directory to search inside.",
        },
        pattern: {
          type: "string",
          description: "Case-insensitive substring to match against filenames.",
        },
        extensions: {
          type: "array",
          items: { type: "string" },
          description: "Optional file extensions to include, without dots if possible.",
        },
        max_results: {
          type: "integer",
          description: "Maximum number of matches to return.",
        },
      },
      required: ["directory"],
      additionalProperties: false,
    },
  },
  {
    name: "local_get_file_info",
    description:
      "Get metadata for a local file or directory on this device, including size, timestamps, type, and extension.",
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
          description: "Execution timeout in seconds (default: 30, max: 300).",
        },
      },
      required: ["language", "code"],
      additionalProperties: false,
    },
  },
  {
    name: "generate_file",
    description:
      "Generate a document file (PDF, DOCX, or PPTX) using Python libraries in a sandboxed environment. The data object specifies the document content structure.",
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
          description: "Optional absolute path to save the generated file on the local device.",
        },
      },
      required: ["file_type", "data"],
      additionalProperties: false,
    },
  },
  {
    name: "pdf_read",
    description:
      "Read and extract text content from a PDF file on this device. Returns page-by-page text and metadata (title, author).",
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
      "Read and extract content from a Word document (.docx) on this device. Returns paragraphs with styles, tables, and metadata.",
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
];

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
    tool_arguments: mergeChunkText(existing.tool_arguments, incoming.tool_arguments),
    tool_result: mergeChunkText(existing.tool_result, incoming.tool_result),
    result: mergeChunkText(existing.result, incoming.result),
  };
}

function getChunkSourceId(chunk: AgentChunk): string {
  return chunk.id || chunk.tool_id || chunk.created_at || "unknown";
}

type ChunkGroup = "assistant" | "thinking" | "tool" | "artifact" | "usage" | "other";

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

function getChunkStreamKey(chunk: AgentChunk, streamState?: StreamScopeState): string {
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

function resolvePendingToolCall(prev: AgentChunk[], toolId: string): AgentChunk[] {
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
        (chunk) => !!chunk.tool_id && (chunk.type === "tool_result" || chunk.type === "tool_call"),
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
) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [chunks, setChunks] = useState<AgentChunk[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [input, setInput] = useState("");
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [pinnedRooms, setPinnedRooms] = useState<string[]>(loadPinnedRooms);
  const [selectedModel, setSelectedModel] = useState<string>(
    () => localStorage.getItem(MODEL_KEY) ?? "anthropic/claude-sonnet-4-5",
  );
  const abortRef = useRef<AbortController | null>(null);
  const skipNextSessionLoadRef = useRef<string | null>(null);
  const lastMessageRef = useRef<{ message: string; attachments?: InlineAttachment[] } | null>(null);

  const handlePendingToolCall = useCallback(
    async (currentSessionId: string, chunk: AgentChunk & { args?: Record<string, unknown> }) => {
      if (!client || !chunk.tool_id || !chunk.tool_name) return;

      let resultText = "";

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
        } catch (error) {
          resultText = stringifyToolPayload({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (chunk.fire_and_forget) return;
      await client.submitToolResult(currentSessionId, {
        tool_id: chunk.tool_id,
        result: resultText,
        is_finished: true,
      });
      setChunks((prev) => resolvePendingToolCall(prev, chunk.tool_id!));
    },
    [client, onCanvasToolCall],
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
          setError(e instanceof Error ? e : new Error(String(e)));
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
      setSessions(items);
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
    async (task: string, newRoomTitle?: string, attachments?: InlineAttachment[]) => {
      if (!client) return;
      setIsLoading(true);
      setError(null);

      let currentSessionId = sessionId;
      if (!currentSessionId) {
        try {
          const session = await client.createSession(newRoomTitle || task.slice(0, 50));
          currentSessionId = session.session.id;
          skipNextSessionLoadRef.current = currentSessionId;
          setSessionId(currentSessionId);
          setSessions((prev) => [
            {
              id: session.session.id,
              name: session.session.name,
              created_at: new Date().toISOString(),
            },
            ...prev,
          ]);
        } catch (e) {
          setError(e instanceof Error ? e : new Error(String(e)));
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
      const toolCallMeta = new Map<string, { toolName: string; toolArguments: string }>();

      const trackToolCall = (chunk: AgentChunk) => {
        if (!chunk.tool_id) return;
        if (
          (chunk.type === "tool_call" || chunk.type === "tool_call_args" || chunk.type === "tool_call_pending") &&
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
                mergeChunkText(existing.toolArguments, chunk.tool_arguments) || "";
            }
          }
        } else if (
          (chunk.type === "tool_call_args") &&
          chunk.tool_arguments
        ) {
          const existing = toolCallMeta.get(chunk.tool_id);
          if (existing) {
            existing.toolArguments =
              mergeChunkText(existing.toolArguments, chunk.tool_arguments) || "";
          }
        }
      };

      const detectFileWriteArtifact = (chunk: AgentChunk) => {
        if (chunk.type !== "tool_result" || !chunk.tool_id || !onArtifact) return;
        const meta = toolCallMeta.get(chunk.tool_id);
        if (!meta || !isFileWriteTool(meta.toolName)) return;
        const artifact = fileWriteToArtifact(
          chunk.tool_id,
          meta.toolArguments,
          chunk.created_at || new Date().toISOString(),
        );
        if (artifact) onArtifact(artifact);
      };

      const executeWithRetry = async (attempt: number): Promise<void> => {
        try {
          const args: AgentExecuteRequest = {
            task,
            model: selectedModel,
            max_requests: 10,
            use_json_tool_calls: true,
            client_tools: [...CLIENT_TOOLS, ...(mcpTools ?? [])],
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
              setError(new Error("応答がタイムアウトしました。再試行してください。"));
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
                  const parsed = JSON.parse(data);
                  if ("error" in parsed && parsed.error) {
                    const msg = (parsed.error as { message?: string }).message ?? "Unknown error";
                    setError(new Error(msg));
                    continue;
                  }
                  const normalized = normalizeIncomingChunk(parsed as AgentChunk);
                  const chunk = withStreamScopedId(
                    normalized,
                    mergeableStreamKeys,
                    streamInstanceId,
                    streamScopeState,
                  );
                  receivedStreamChunk = true;
                  setChunks((prev) => upsertChunk(prev, chunk));
                  if (chunk.type === "tool_call_pending" && currentSessionId) {
                    await handlePendingToolCall(
                      currentSessionId,
                      parsed as AgentChunk & { args?: Record<string, unknown> },
                    );
                  }
                  if (chunk.type === "artifact" && onArtifact) {
                    onArtifact(chunkToArtifact(chunk));
                  }
                  trackToolCall(chunk);
                  detectFileWriteArtifact(chunk);
                } catch {
                  // skip malformed JSON
                }
              }
            }
          } finally {
            if (streamTimeoutId) clearTimeout(streamTimeoutId);
          }

          const finalData = parseSseEvent(buffer);
          if (finalData && finalData !== "[DONE]") {
            try {
              const normalized = normalizeIncomingChunk(JSON.parse(finalData) as AgentChunk);
              const chunk = withStreamScopedId(
                normalized,
                mergeableStreamKeys,
                streamInstanceId,
                streamScopeState,
              );
              receivedStreamChunk = true;
              setChunks((prev) => upsertChunk(prev, chunk));
              if (chunk.type === "tool_call_pending" && currentSessionId) {
                await handlePendingToolCall(
                  currentSessionId,
                  JSON.parse(finalData) as AgentChunk & {
                    args?: Record<string, unknown>;
                  },
                );
              }
              if (chunk.type === "artifact" && onArtifact) {
                onArtifact(chunkToArtifact(chunk));
              }
              trackToolCall(chunk);
              detectFileWriteArtifact(chunk);
            } catch {
              // ignore trailing partial event
            }
          }
        } catch (e) {
          if (e instanceof Error && e.name === "AbortError") throw e;
          // Retry on transient errors if we haven't received any chunks yet
          if (!receivedStreamChunk && attempt < MAX_RETRIES && isRetryableError(e)) {
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
          setError(e);
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
    [sessionId, client, selectedModel, onArtifact, handlePendingToolCall, mcpTools],
  );

  const sendMessage = useCallback(
    async (message: string, attachments?: InlineAttachment[]) => {
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
      lastMessageRef.current = { message, attachments };
      // Backend requires a non-empty task; use default for image-only sends
      const taskText = trimmed || "この画像について説明してください";
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
      const next = prev.includes(roomId) ? prev.filter((id) => id !== roomId) : [...prev, roomId];
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
    const { message, attachments } = lastMessageRef.current;
    await startTask(message.trim() || "この画像について説明してください", undefined, attachments);
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
