import { useCallback, useEffect, useRef, useState } from "react";
import { AgentChatClient } from "../lib/api-client";
import type { AgentChunk, AgentExecuteRequest, ChatRoom } from "../lib/types";

const MODEL_KEY = "tachyon-cowork-model";

export function useAgentChat(client: AgentChatClient | null) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [chunks, setChunks] = useState<AgentChunk[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [input, setInput] = useState("");
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(
    () => localStorage.getItem(MODEL_KEY) ?? "anthropic/claude-sonnet-4-5",
  );
  const abortRef = useRef<AbortController | null>(null);

  // Persist model selection
  useEffect(() => {
    localStorage.setItem(MODEL_KEY, selectedModel);
  }, [selectedModel]);

  // Load messages when session changes
  useEffect(() => {
    if (!sessionId || !client) {
      setChunks([]);
      return;
    }
    let cancelled = false;
    client
      .getMessages(sessionId)
      .then((messages) => {
        if (!cancelled) setChunks(messages);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [sessionId, client]);

  // Fetch chat rooms
  const fetchChatRooms = useCallback(async () => {
    if (!client) return;
    try {
      const rooms = await client.getChatrooms();
      setChatRooms(rooms);
    } catch (e) {
      console.error("Failed to fetch chatrooms:", e);
    }
  }, [client]);

  // Load rooms on mount
  useEffect(() => {
    fetchChatRooms();
  }, [fetchChatRooms]);

  // Start task: create room if needed, then stream SSE
  const startTask = useCallback(
    async (task: string, newRoomTitle?: string) => {
      if (!client) return;
      setIsLoading(true);
      setError(null);

      let currentSessionId = sessionId;
      if (!currentSessionId) {
        try {
          const room = await client.createChatRoom(
            newRoomTitle || task.slice(0, 50),
          );
          currentSessionId = room.chatroom.id;
          setSessionId(currentSessionId);
          // Add to sidebar
          setChatRooms((prev) => [
            {
              id: room.chatroom.id,
              name: room.chatroom.name,
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

        // Refetch to get server-persisted IDs
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
    [sessionId, client, selectedModel],
  );

  const sendMessage = useCallback(
    async (message: string) => {
      const trimmed = message.trim();
      if (!trimmed || isLoading) return;

      const userChunk: AgentChunk = {
        type: "user",
        id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        text: trimmed,
        created_at: new Date().toISOString(),
      };
      setChunks((prev) => [...prev, userChunk]);
      await startTask(trimmed);
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
        await client.deleteChatroom(id);
        setChatRooms((prev) => prev.filter((r) => r.id !== id));
        if (sessionId === id) newChat();
      } catch (e) {
        console.error("Failed to delete chatroom:", e);
      }
    },
    [client, sessionId, newChat],
  );

  // Cleanup on unmount
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
    chatRooms,
    handleSubmit,
    sendMessage,
    newChat,
    selectSession,
    deleteRoom,
    fetchChatRooms,
  };
}
