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
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
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
              const chunk = parsed as AgentChunk;
              setChunks((prev) => [...prev, chunk]);
              if (chunk.type === "artifact" && onArtifact) {
                onArtifact(chunkToArtifact(chunk));
              }
            } catch {
              // skip malformed JSON
            }
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
            const msgs = await client.getMessages(currentSessionId);
            if (msgs.length > 0) setChunks(msgs);
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
