import { useCallback, useEffect, useRef, useState } from "react";
import { AgentChatClient } from "../lib/api-client";
import type {
  AgentChunk,
  AgentExecuteRequest,
  Artifact,
  InlineAttachment,
  SessionSummary,
} from "../lib/types";
import { chunkToArtifact } from "./useArtifact";

const MODEL_KEY = "tachyon-cowork-model";
const PINNED_KEY = "tachyon-cowork-pinned";

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

function getChunkStreamKey(chunk: AgentChunk): string {
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
): AgentChunk {
  const mergeKey = getChunkStreamKey(incoming);
  const existingId = mergeableKeys.get(mergeKey);
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

export function useAgentChat(
  client: AgentChatClient | null,
  onArtifact?: (artifact: Artifact) => void,
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

  useEffect(() => {
    localStorage.setItem(MODEL_KEY, selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    if (!sessionId || !client) {
      setChunks([]);
      return;
    }
    let cancelled = false;
    setError(null);
    client
      .getMessages(sessionId)
      .then((messages) => {
        if (!cancelled) {
          setChunks(messages);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setChunks([]);
          setError(e instanceof Error ? e : new Error(String(e)));
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
          const session = await client.createSession(
            newRoomTitle || task.slice(0, 50),
          );
          currentSessionId = session.session.id;
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
      let receivedStreamChunk = false;

      try {
        const args: AgentExecuteRequest = {
          task,
          model: selectedModel,
          max_requests: 10,
          ...(attachments && attachments.length > 0 && { attachments }),
        };
        const response = await client.executeAgent(currentSessionId, args);
        if (!response.body) throw new Error("Response body is null");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          if (ac.signal.aborted) break;
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const { events, rest } = extractSseEvents(buffer);
          buffer = rest;

          for (const eventBlock of events) {
            const data = parseSseEvent(eventBlock);
            if (!data || data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if ("error" in parsed && parsed.error) {
                const msg =
                  (parsed.error as { message?: string }).message ??
                  "Unknown error";
                setError(new Error(msg));
                continue;
              }
              const chunk = withStreamScopedId(
                parsed as AgentChunk,
                mergeableStreamKeys,
                streamInstanceId,
              );
              receivedStreamChunk = true;
              setChunks((prev) => upsertChunk(prev, chunk));
              if (chunk.type === "artifact" && onArtifact) {
                onArtifact(chunkToArtifact(chunk));
              }
            } catch {
              // skip malformed JSON
            }
          }
        }

        const finalData = parseSseEvent(buffer);
        if (finalData && finalData !== "[DONE]") {
          try {
            const chunk = withStreamScopedId(
              JSON.parse(finalData) as AgentChunk,
              mergeableStreamKeys,
              streamInstanceId,
            );
            receivedStreamChunk = true;
            setChunks((prev) => upsertChunk(prev, chunk));
            if (chunk.type === "artifact" && onArtifact) {
              onArtifact(chunkToArtifact(chunk));
            }
          } catch {
            // ignore trailing partial event
          }
        }
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
                setChunks(msgs);
              }
            }
          } catch {
            /* ignore */
          }
        }
      }
    },
    [sessionId, client, selectedModel, onArtifact],
  );

  const sendMessage = useCallback(
    async (message: string, attachments?: InlineAttachment[]) => {
      const trimmed = message.trim();
      const hasAttachments = attachments && attachments.length > 0;
      if ((!trimmed && !hasAttachments) || isLoading) return;

      // Build preview data URLs for image attachments to display in user bubble
      const imageUrls = attachments
        ?.filter((a) => a.content_type.startsWith("image/"))
        .map((a) => `data:${a.content_type};base64,${a.data}`)
        ?? undefined;

      const userChunk: AgentChunk = {
        type: "user",
        id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        text: trimmed,
        created_at: new Date().toISOString(),
        ...(imageUrls && imageUrls.length > 0 && { imageUrls }),
      };
      setChunks((prev) => [...prev, userChunk]);
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
      const next = prev.includes(roomId)
        ? prev.filter((id) => id !== roomId)
        : [...prev, roomId];
      savePinnedRooms(next);
      return next;
    });
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
    chatRooms: sessions,
    sessions,
    pinnedRooms,
    togglePin,
    handleSubmit,
    sendMessage,
    newChat,
    selectSession,
    deleteRoom,
    fetchSessions,
  };
}
