import { useCallback, useEffect, useRef, useState } from "react";
import { ApiRequestError, type AgentChatClient } from "../lib/api-client";
import type {
  RealtimeTranscriptMessage,
  RealtimeTranscriptRole,
} from "../lib/types";

export type RealtimeVoiceStatus = "idle" | "connecting" | "connected";

type RealtimeVoiceOptions = {
  onTranscript?: (message: RealtimeTranscriptMessage) => void;
  getAgentChatDraft?: () => string;
  onSetAgentChatDraft?: (text: string) => void;
  onSubmitAgentChatDraft?: (text: string) => Promise<void> | void;
};

type RealtimeVoiceState = {
  status: RealtimeVoiceStatus;
  error: string | null;
  transcripts: RealtimeTranscriptMessage[];
  start: () => Promise<void>;
  stop: () => void;
  appendTranscript: (message: RealtimeTranscriptMessage) => void;
  clearTranscripts: () => void;
  clearError: () => void;
};

const REALTIME_CALL_URL = "https://api.openai.com/v1/realtime/calls";

type RealtimeToolName =
  | "set_agent_chat_draft"
  | "update_agent_chat_draft"
  | "submit_agent_chat_draft";

type RealtimeToolCall = {
  callId: string;
  name: RealtimeToolName;
  argumentsJson: string;
};

const AGENT_CHAT_DRAFT_TOOLS = [
  {
    type: "function",
    name: "set_agent_chat_draft",
    description:
      "Put text into the normal Agent chat send form. Use this when the user asks you to prepare, write, or draft something for the Agent chat. This does not send the message.",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "The exact text to place into the Agent chat form.",
        },
      },
      required: ["text"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "update_agent_chat_draft",
    description:
      "Replace the current Agent chat draft with corrected or revised text. Use this when the user asks you to fix, rewrite, shorten, or otherwise revise the draft before sending.",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "The revised full text for the Agent chat form.",
        },
      },
      required: ["text"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "submit_agent_chat_draft",
    description:
      "Send the current Agent chat draft to the normal Agent chat. Only use this when the user explicitly asks to send it to the Agent chat.",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description:
            "Optional final text to send. If omitted, the app sends the current Agent chat form text.",
        },
      },
      additionalProperties: false,
    },
  },
] as const;

const REALTIME_AGENT_CHAT_INSTRUCTIONS = [
  "You are primarily a voice-driven text input assistant for the normal Agent chat.",
  "Keep Realtime voice conversation separate from Agent chat history unless the user explicitly asks to send something to Agent chat.",
  "For lightweight thinking work such as brainstorming, phrasing, outlining, summarizing the user's intent, or refining a prompt, continue the Realtime conversation and help shape the text before handing it off.",
  "When the request needs Agent tools, files, web search, current information, code execution, persistence, or deeper investigation, prepare a clear Agent chat prompt that preserves the user's intent instead of completing the task yourself.",
  "For requests like today's weather, latest information, research, debugging, or repository work, use the conversation to clarify or improve the request if useful, then route the final prompt to Agent chat.",
  "Use set_agent_chat_draft to place a prompt in the Agent chat form, update_agent_chat_draft to revise it, and submit_agent_chat_draft only when the user explicitly asks you to send it.",
  "If the user says to send the request to Agent chat, submit the draft or submit the final prompt directly.",
].join(" ");

export function buildRealtimeToolSessionUpdate() {
  return {
    type: "session.update",
    session: {
      instructions: REALTIME_AGENT_CHAT_INSTRUCTIONS,
      tool_choice: "auto",
      tools: AGENT_CHAT_DRAFT_TOOLS,
    },
  };
}

export type RealtimeTranscriptUpdate = {
  role: RealtimeTranscriptRole;
  id: string;
  text: string;
  isFinal: boolean;
  mode: "append" | "replace";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function isRealtimeToolName(value: unknown): value is RealtimeToolName {
  return (
    value === "set_agent_chat_draft" ||
    value === "update_agent_chat_draft" ||
    value === "submit_agent_chat_draft"
  );
}

function fallbackTranscriptId(): string {
  return `event-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function buildTranscriptId(
  role: RealtimeTranscriptRole,
  event: Record<string, unknown>,
): string {
  const stableId =
    readString(event.item_id) ??
    readString(event.response_id) ??
    readString(event.event_id) ??
    fallbackTranscriptId();
  const outputIndex = readNumber(event.output_index);
  const contentIndex = readNumber(event.content_index);
  return [role, stableId, outputIndex, contentIndex]
    .filter((part) => part !== undefined)
    .join(":");
}

export function extractRealtimeTranscriptUpdate(
  event: unknown,
): RealtimeTranscriptUpdate | null {
  if (!isRecord(event)) return null;

  const type = readString(event.type);
  if (!type) return null;

  switch (type) {
    case "conversation.item.input_audio_transcription.delta": {
      const delta = readString(event.delta);
      if (!delta) return null;
      return {
        role: "user",
        id: buildTranscriptId("user", event),
        text: delta,
        isFinal: false,
        mode: "append",
      };
    }
    case "conversation.item.input_audio_transcription.completed": {
      const transcript = readString(event.transcript);
      if (!transcript) return null;
      return {
        role: "user",
        id: buildTranscriptId("user", event),
        text: transcript,
        isFinal: true,
        mode: "replace",
      };
    }
    case "response.output_audio_transcript.delta":
    case "response.audio_transcript.delta":
    case "response.output_text.delta":
    case "response.text.delta": {
      const delta = readString(event.delta);
      if (!delta) return null;
      return {
        role: "assistant",
        id: buildTranscriptId("assistant", event),
        text: delta,
        isFinal: false,
        mode: "append",
      };
    }
    case "response.output_audio_transcript.done":
    case "response.audio_transcript.done": {
      const transcript = readString(event.transcript);
      if (!transcript) return null;
      return {
        role: "assistant",
        id: buildTranscriptId("assistant", event),
        text: transcript,
        isFinal: true,
        mode: "replace",
      };
    }
    case "response.output_text.done":
    case "response.text.done": {
      const text = readString(event.text);
      if (!text) return null;
      return {
        role: "assistant",
        id: buildTranscriptId("assistant", event),
        text,
        isFinal: true,
        mode: "replace",
      };
    }
    default:
      return null;
  }
}

export function extractRealtimeToolCall(event: unknown): RealtimeToolCall | null {
  if (!isRecord(event)) return null;
  const type = readString(event.type);

  const readToolCallFromItem = (
    item: Record<string, unknown>,
  ): RealtimeToolCall | null => {
    const itemType = readString(item.type);
    if (itemType !== "function_call") return null;
    const callId = readString(item.call_id);
    const name = readString(item.name);
    const argumentsJson = readString(item.arguments);
    if (!callId || !isRealtimeToolName(name) || !argumentsJson) return null;
    return { callId, name, argumentsJson };
  };

  if (type === "response.function_call_arguments.done") {
    const callId = readString(event.call_id);
    const name = readString(event.name);
    const argumentsJson = readString(event.arguments);
    if (!callId || !isRealtimeToolName(name) || !argumentsJson) return null;
    return { callId, name, argumentsJson };
  }

  if (
    (type === "response.output_item.done" ||
      type === "conversation.item.done") &&
    isRecord(event.item)
  ) {
    return readToolCallFromItem(event.item);
  }

  if (type === "response.done" && isRecord(event.response)) {
    const output = event.response.output;
    if (!Array.isArray(output)) return null;
    for (const item of output) {
      if (!isRecord(item)) continue;
      const toolCall = readToolCallFromItem(item);
      if (toolCall) return toolCall;
    }
  }

  return null;
}

function toUserFacingRealtimeError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 401 || error.status === 403) {
      return "音声会話の認証に失敗しました。再ログインしてから再試行してください。";
    }

    return "音声会話の準備に失敗しました。時間をおいて再試行してください。";
  }

  if (!(error instanceof Error)) {
    return "音声会話を開始できませんでした。少し待ってから再試行してください。";
  }

  const message = error.message.toLowerCase();
  const errorName = error.name.toLowerCase();
  if (
    errorName === "notallowederror" ||
    errorName === "securityerror" ||
    message.includes("permission") ||
    message.includes("notallowed") ||
    message.includes("denied")
  ) {
    return "マイクの利用が許可されていません。端末の設定でマイク権限を許可してください。";
  }
  if (
    errorName === "notfounderror" ||
    errorName === "devicesnotfounderror" ||
    errorName === "overconstrainederror"
  ) {
    return "利用できるマイクが見つかりませんでした。入力デバイスを確認してください。";
  }
  if (message.includes("401") || message.includes("403")) {
    return "音声会話の認証に失敗しました。再ログインしてから再試行してください。";
  }
  if (
    message.includes("client secret") ||
    message.includes("realtime") ||
    message.includes("5")
  ) {
    return "音声会話の準備に失敗しました。時間をおいて再試行してください。";
  }

  return "音声会話を開始できませんでした。ネットワークを確認して再試行してください。";
}

export function useRealtimeVoice(
  client: AgentChatClient | null,
  options: RealtimeVoiceOptions = {},
): RealtimeVoiceState {
  const [status, setStatus] = useState<RealtimeVoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<RealtimeTranscriptMessage[]>(
    [],
  );
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const optionsRef = useRef(options);
  const transcriptTextByIdRef = useRef<Map<string, string>>(new Map());
  const handledToolCallIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const stop = useCallback(() => {
    dataChannelRef.current?.close();
    dataChannelRef.current = null;

    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;

    for (const track of mediaStreamRef.current?.getTracks() ?? []) {
      track.stop();
    }
    mediaStreamRef.current = null;

    if (audioRef.current) {
      audioRef.current.srcObject = null;
      audioRef.current.remove();
      audioRef.current = null;
    }
    transcriptTextByIdRef.current.clear();
    handledToolCallIdsRef.current.clear();
    setStatus("idle");
  }, []);

  const appendTranscript = useCallback(
    (message: RealtimeTranscriptMessage) => {
      if (!message.text.trim()) return;

      setTranscripts((prev) => {
        const existingIndex = prev.findIndex((item) => item.id === message.id);
        if (existingIndex === -1) {
          return [...prev, message];
        }

        const next = [...prev];
        next[existingIndex] = message;
        return next;
      });
      optionsRef.current.onTranscript?.(message);
    },
    [],
  );

  const handleRealtimeToolCall = useCallback(
    async (toolCall: RealtimeToolCall) => {
      if (handledToolCallIdsRef.current.has(toolCall.callId)) return;
      handledToolCallIdsRef.current.add(toolCall.callId);

      let output: Record<string, unknown>;
      try {
        const parsedArgs = JSON.parse(toolCall.argumentsJson) as unknown;
        const args = isRecord(parsedArgs) ? parsedArgs : {};
        const textArg = readString(args.text);

        if (
          toolCall.name === "set_agent_chat_draft" ||
          toolCall.name === "update_agent_chat_draft"
        ) {
          if (!textArg?.trim()) {
            output = { ok: false, error: "text is required" };
          } else {
            optionsRef.current.onSetAgentChatDraft?.(textArg);
            output = { ok: true, draft: textArg };
          }
        } else {
          const draft = (textArg ?? optionsRef.current.getAgentChatDraft?.() ?? "")
            .trim();
          if (!draft) {
            output = { ok: false, error: "agent chat draft is empty" };
          } else if (!optionsRef.current.onSubmitAgentChatDraft) {
            output = { ok: false, error: "agent chat submit is unavailable" };
          } else {
            await optionsRef.current.onSubmitAgentChatDraft(draft);
            output = { ok: true, sent: draft };
          }
        }
      } catch (error) {
        output = {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      const dataChannel = dataChannelRef.current;
      if (!dataChannel || dataChannel.readyState !== "open") return;

      dataChannel.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: toolCall.callId,
            output: JSON.stringify(output),
          },
        }),
      );
      dataChannel.send(JSON.stringify({ type: "response.create" }));
    },
    [],
  );

  const handleRealtimeEvent = useCallback((rawData: unknown) => {
    let parsed: unknown = rawData;
    if (typeof rawData === "string") {
      try {
        parsed = JSON.parse(rawData) as unknown;
      } catch {
        return;
      }
    }

    const toolCall = extractRealtimeToolCall(parsed);
    if (toolCall) {
      void handleRealtimeToolCall(toolCall);
      return;
    }

    const update = extractRealtimeTranscriptUpdate(parsed);
    if (!update) return;

    const current = transcriptTextByIdRef.current.get(update.id) ?? "";
    const text =
      update.mode === "append" ? `${current}${update.text}` : update.text;
    if (!text.trim()) return;

    transcriptTextByIdRef.current.set(update.id, text);
    appendTranscript({
      role: update.role,
      id: update.id,
      text,
      isFinal: update.isFinal,
    });
  }, [appendTranscript, handleRealtimeToolCall]);

  const start = useCallback(async () => {
    if (!client) {
      setError("ログイン後に音声会話を開始できます。");
      return;
    }
    if (status !== "idle") return;

    setError(null);
    setStatus("connecting");
    transcriptTextByIdRef.current.clear();
    setTranscripts([]);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("media devices are not available");
      }

      const secret = await client.issueRealtimeClientSecret({
        voice: "marin",
        instruction_preset: "cowork_assistant",
        transcription: "ja",
        vad: "server_vad",
      });

      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;

      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.setAttribute("playsinline", "true");
      audio.style.display = "none";
      document.body.appendChild(audio);
      audioRef.current = audio;

      pc.ontrack = (event) => {
        audio.srcObject = event.streams[0] ?? null;
        void audio.play().catch(() => undefined);
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          setStatus("connected");
          return;
        }
        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "disconnected" ||
          pc.connectionState === "closed"
        ) {
          stop();
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;
      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream);
      }

      const dataChannel = pc.createDataChannel("oai-events");
      dataChannelRef.current = dataChannel;
      dataChannel.onopen = () => {
        dataChannel.send(JSON.stringify(buildRealtimeToolSessionUpdate()));
      };
      dataChannel.onerror = () => {
        setError("音声会話の接続でエラーが発生しました。再接続してください。");
      };
      dataChannel.onmessage = (event) => {
        handleRealtimeEvent(event.data);
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch(REALTIME_CALL_URL, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${secret.client_secret}`,
          "Content-Type": "application/sdp",
        },
      });

      if (!sdpResponse.ok) {
        const body = await sdpResponse.text().catch(() => "");
        throw new Error(
          `Voice SDP exchange failed: ${sdpResponse.status} ${body}`,
        );
      }

      await pc.setRemoteDescription({
        type: "answer",
        sdp: await sdpResponse.text(),
      });
    } catch (err) {
      stop();
      setError(toUserFacingRealtimeError(err));
    }
  }, [client, handleRealtimeEvent, status, stop]);

  const clearTranscripts = useCallback(() => {
    transcriptTextByIdRef.current.clear();
    setTranscripts([]);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  useEffect(() => stop, [stop]);

  return {
    status,
    error,
    transcripts,
    start,
    stop,
    appendTranscript,
    clearTranscripts,
    clearError,
  };
}
