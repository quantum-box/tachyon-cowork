import { useCallback, useEffect, useRef, useState } from "react";
import { ApiRequestError, type AgentChatClient } from "../lib/api-client";
import type {
  AgentChunk,
  RealtimeTranscriptMessage,
  RealtimeTranscriptRole,
} from "../lib/types";

export type RealtimeVoiceStatus = "idle" | "connecting" | "connected";

type RealtimeVoiceOptions = {
  onTranscript?: (message: RealtimeTranscriptMessage) => void;
  getAgentChatDraft?: () => string;
  getAgentChatContext?: () => string;
  onSetAgentChatDraft?: (text: string) => void;
  onSubmitAgentChatDraft?: (text: string) => Promise<void> | void;
  onSubmitFocusedForm?: () => Promise<void> | void;
  onStopRealtimeVoice?: () => Promise<void> | void;
  soundEnabled?: boolean;
  instructions?: string;
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
export const REALTIME_VAD_PRESET = "server_vad_ambient";
export const REALTIME_AMBIENT_TURN_DETECTION = {
  type: "server_vad",
  threshold: 0.7,
  prefix_padding_ms: 500,
  silence_duration_ms: 800,
};
export const REALTIME_PLAYBACK_TURN_DETECTION = {
  type: "server_vad",
  threshold: 0.85,
  prefix_padding_ms: 500,
  silence_duration_ms: 1000,
};

type RealtimeDeviceHints = {
  userAgent?: string;
  userAgentData?: { mobile?: boolean };
  maxTouchPoints?: number;
  coarsePointer?: boolean;
};

function readRealtimeDeviceHints(): RealtimeDeviceHints {
  const nav = navigator as Navigator & {
    userAgentData?: { mobile?: boolean };
  };
  return {
    userAgent: nav.userAgent,
    userAgentData: nav.userAgentData,
    maxTouchPoints: nav.maxTouchPoints,
    coarsePointer: window.matchMedia?.("(pointer: coarse)")?.matches,
  };
}

export function shouldDisableRealtimeAutoGainControl(
  hints: RealtimeDeviceHints = readRealtimeDeviceHints(),
): boolean {
  if (hints.userAgentData?.mobile) return true;
  if (/Android|iPhone|iPad|iPod/i.test(hints.userAgent ?? "")) return true;
  return hints.coarsePointer === true && (hints.maxTouchPoints ?? 0) > 0;
}

export function buildRealtimeAudioConstraints(
  hints?: RealtimeDeviceHints,
): MediaTrackConstraints {
  return {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: !shouldDisableRealtimeAutoGainControl(hints),
  };
}

export function buildRealtimeVadSessionUpdate(
  turnDetection:
    | typeof REALTIME_AMBIENT_TURN_DETECTION
    | typeof REALTIME_PLAYBACK_TURN_DETECTION,
) {
  return {
    type: "session.update",
    session: {
      audio: {
        input: {
          turn_detection: turnDetection,
        },
      },
    },
  } as const;
}

type BrowserAudioContextConstructor = new () => AudioContext;

function getBrowserAudioContext(): BrowserAudioContextConstructor | null {
  const audioWindow = window as Window &
    typeof globalThis & {
      webkitAudioContext?: BrowserAudioContextConstructor;
    };
  return audioWindow.AudioContext ?? audioWindow.webkitAudioContext ?? null;
}

export function playRealtimeCue(
  kind: "ready" | "start" | "stop" | "error" | "thinking",
) {
  const AudioContextConstructor = getBrowserAudioContext();
  if (!AudioContextConstructor) return;

  try {
    const audioContext = new AudioContextConstructor();
    if (audioContext.state === "suspended") {
      void audioContext.resume().catch(() => undefined);
    }
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.connect(audioContext.destination);

    const tonesByKind = {
      ready: [
        { frequency: 587, offset: 0, duration: 0.075 },
        { frequency: 880, offset: 0.075, duration: 0.11 },
      ],
      start: [
        { frequency: 587, offset: 0, duration: 0.075 },
        { frequency: 880, offset: 0.075, duration: 0.11 },
      ],
      stop: [
        { frequency: 880, offset: 0, duration: 0.075 },
        { frequency: 587, offset: 0.075, duration: 0.11 },
      ],
      error: [
        { frequency: 220, offset: 0, duration: 0.11 },
        { frequency: 185, offset: 0.13, duration: 0.14 },
      ],
      thinking: [
        { frequency: 440, offset: 0, duration: 0.08 },
        { frequency: 554, offset: 0.1, duration: 0.08 },
        { frequency: 659, offset: 0.2, duration: 0.1 },
      ],
    } satisfies Record<
      "ready" | "start" | "stop" | "error" | "thinking",
      Array<{ frequency: number; offset: number; duration: number }>
    >;

    for (const tone of tonesByKind[kind]) {
      const oscillator = audioContext.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(
        tone.frequency,
        audioContext.currentTime + tone.offset,
      );
      oscillator.connect(gain);
      oscillator.start(audioContext.currentTime + tone.offset);
      oscillator.stop(audioContext.currentTime + tone.offset + tone.duration);
    }

    const peakGain =
      kind === "ready" || kind === "start"
        ? 0.16
        : kind === "stop"
          ? 0.13
          : kind === "thinking"
            ? 0.18
            : 0.04;
    gain.gain.exponentialRampToValueAtTime(
      peakGain,
      audioContext.currentTime + 0.015,
    );
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      audioContext.currentTime + (kind === "thinking" ? 0.42 : 0.28),
    );

    window.setTimeout(
      () => {
        void audioContext.close().catch(() => undefined);
      },
      kind === "thinking" ? 520 : 360,
    );
  } catch {
    // Audio feedback is non-critical and may be blocked by the browser.
  }
}

type RealtimeToolName =
  | "set_agent_chat_draft"
  | "update_agent_chat_draft"
  | "submit_agent_chat_draft"
  | "submit_focused_form"
  | "read_agent_chat_context"
  | "stop_realtime_voice";

type RealtimeToolCall = {
  callId: string;
  name: RealtimeToolName;
  argumentsJson: string;
};

const AGENT_CHAT_DRAFT_TOOLS = [
  {
    type: "function",
    name: "read_agent_chat_context",
    description:
      "Read a compact summary of the current normal Agent chat conversation, including recent user requests, assistant answers, tool results, and errors. Use this after an Agent chat turn completes or when the user asks about what the Agent said.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "stop_realtime_voice",
    description:
      "End the current Realtime voice conversation. Use this when the user asks you to stop, finish, close, or end Realtime voice mode.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
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
  {
    type: "function",
    name: "submit_focused_form",
    description:
      "Press Cmd+Enter in the previously focused macOS form field. Use this in Voice Dot form-input mode when the user asks to send or submit the target form after text has been inserted.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
] as const;

const REALTIME_AGENT_CHAT_INSTRUCTIONS = [
  "You are primarily a voice-driven text input assistant for the normal Agent chat.",
  "Always speak, transcribe, draft, revise, and submit in Japanese. Do not switch languages unless the user explicitly asks for translation or non-Japanese output.",
  "You have six client tools available: read_agent_chat_context, stop_realtime_voice, set_agent_chat_draft, update_agent_chat_draft, submit_agent_chat_draft, and submit_focused_form.",
  "If the user asks what tools you can use, briefly explain these tools: one reads the current Agent chat context, one ends Realtime voice mode, three control the Agent chat input form, and one can press Cmd+Enter in the focused macOS form when available.",
  "Keep Realtime voice conversation separate from Agent chat history unless the user explicitly asks to send something to Agent chat.",
  "When resuming after Agent chat work, use the provided Agent chat context or call read_agent_chat_context before explaining the result to the user.",
  "When you draft, revise, or submit text to Agent chat, write it in Japanese unless the user explicitly asks for translation or a different language.",
  "For lightweight thinking work such as brainstorming, phrasing, outlining, summarizing the user's intent, or refining a prompt, continue the Realtime conversation and help shape the text before handing it off.",
  "When the request needs Agent tools, files, web search, current information, code execution, persistence, or deeper investigation, prepare a clear Agent chat prompt that preserves the user's intent instead of completing the task yourself.",
  "For requests like today's weather, latest information, research, debugging, or repository work, use the conversation to clarify or improve the request if useful, then route the final prompt to Agent chat.",
  "Use set_agent_chat_draft to place a prompt in the Agent chat form, update_agent_chat_draft to revise it, and submit_agent_chat_draft only when the user explicitly asks you to send it.",
  "If the user says to send the request to Agent chat, submit the draft or submit the final prompt directly.",
].join(" ");

function getAgentChunkText(chunk: AgentChunk): string {
  return (
    chunk.text ??
    chunk.result ??
    chunk.tool_result ??
    chunk.content ??
    chunk.thinking ??
    ""
  ).trim();
}

function getAgentChunkLabel(chunk: AgentChunk): string | null {
  if (chunk.type === "user") return "User";
  if (
    chunk.type === "assistant" ||
    chunk.type === "say" ||
    chunk.type === "attempt_completion" ||
    chunk.type === "completion"
  ) {
    return "Agent";
  }
  if (chunk.type === "tool_result")
    return `Tool result${chunk.tool_name ? ` (${chunk.tool_name})` : ""}`;
  if (chunk.type === "tool_call")
    return `Tool call${chunk.tool_name ? ` (${chunk.tool_name})` : ""}`;
  if (chunk.type === "error") return "Error";
  return null;
}

export function buildRealtimeAgentChatContext(chunks: AgentChunk[]): string {
  const lines = chunks
    .map((chunk) => {
      const label = getAgentChunkLabel(chunk);
      const text = getAgentChunkText(chunk);
      if (!label || !text) return null;
      return `${label}: ${text.replace(/\s+/g, " ").slice(0, 900)}`;
    })
    .filter((line): line is string => Boolean(line))
    .slice(-10);

  return lines.length > 0
    ? lines.join("\n")
    : "Agentチャットにはまだ参照できる内容がありません。";
}

export function buildRealtimeToolSessionConfig(agentChatContext?: string) {
  return buildRealtimeToolSessionConfigWithInstructions(
    REALTIME_AGENT_CHAT_INSTRUCTIONS,
    agentChatContext,
  );
}

function buildRealtimeToolSessionConfigWithInstructions(
  instructions: string,
  agentChatContext?: string,
  contextLabel = "Current Agent chat context for this Realtime session",
) {
  const trimmedContext = agentChatContext?.trim();
  return {
    instructions: trimmedContext
      ? `${instructions}\n\n${contextLabel}:\n${trimmedContext.slice(0, 6000)}`
      : instructions,
    tool_choice: "auto",
    tools: AGENT_CHAT_DRAFT_TOOLS,
  } as const;
}

export function buildRealtimeToolSessionUpdate(agentChatContext?: string) {
  return {
    type: "session.update",
    session: buildRealtimeToolSessionConfig(agentChatContext),
  };
}

function isAssistantAudioPlaybackStart(event: unknown): boolean {
  if (!isRecord(event)) return false;
  const type = readString(event.type);
  return (
    type === "response.audio.delta" || type === "response.output_audio.delta"
  );
}

function isAssistantAudioPlaybackDone(event: unknown): boolean {
  if (!isRecord(event)) return false;
  const type = readString(event.type);
  return (
    type === "response.audio.done" ||
    type === "response.output_audio.done" ||
    type === "response.done"
  );
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
    value === "submit_agent_chat_draft" ||
    value === "submit_focused_form" ||
    value === "read_agent_chat_context" ||
    value === "stop_realtime_voice"
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

export function extractRealtimeToolCall(
  event: unknown,
): RealtimeToolCall | null {
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
  const rawMessage = error.message.trim();
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
  if (message.includes("voice sdp exchange failed")) {
    return `音声会話のRealtime接続に失敗しました。${rawMessage}`;
  }
  if (
    message.includes("client secret") ||
    message.includes("realtime") ||
    message.includes("5")
  ) {
    return "音声会話の準備に失敗しました。時間をおいて再試行してください。";
  }

  return `音声会話を開始できませんでした。${rawMessage || "ネットワークを確認して再試行してください。"}`;
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
  const playedConnectedCueRef = useRef(false);
  const realtimeVadModeRef = useRef<"ambient" | "playback">("ambient");
  const startInFlightRef = useRef(false);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const playCue = useCallback(
    (kind: "ready" | "start" | "stop" | "error" | "thinking") => {
      if (optionsRef.current.soundEnabled === false) return;
      playRealtimeCue(kind);
    },
    [],
  );

  const stop = useCallback(() => {
    const shouldPlayStopCue = playedConnectedCueRef.current;

    startInFlightRef.current = false;

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
    playedConnectedCueRef.current = false;
    realtimeVadModeRef.current = "ambient";
    setStatus("idle");

    if (shouldPlayStopCue) {
      playCue("stop");
    }
  }, [playCue]);

  const appendTranscript = useCallback((message: RealtimeTranscriptMessage) => {
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
  }, []);

  const handleRealtimeToolCall = useCallback(
    async (toolCall: RealtimeToolCall) => {
      if (handledToolCallIdsRef.current.has(toolCall.callId)) return;
      handledToolCallIdsRef.current.add(toolCall.callId);

      let output: Record<string, unknown>;
      try {
        const parsedArgs = JSON.parse(toolCall.argumentsJson) as unknown;
        const args = isRecord(parsedArgs) ? parsedArgs : {};
        const textArg = readString(args.text);

        if (toolCall.name === "read_agent_chat_context") {
          output = {
            ok: true,
            context:
              optionsRef.current.getAgentChatContext?.() ??
              "Agentチャットにはまだ参照できる内容がありません。",
          };
        } else if (toolCall.name === "stop_realtime_voice") {
          output = { ok: true, stopped: true };
          window.setTimeout(() => {
            stop();
            void Promise.resolve(
              optionsRef.current.onStopRealtimeVoice?.(),
            ).catch((error) => {
              console.error(
                "Failed to run realtime voice stop handler.",
                error,
              );
            });
          }, 0);
        } else if (
          toolCall.name === "set_agent_chat_draft" ||
          toolCall.name === "update_agent_chat_draft"
        ) {
          if (!textArg?.trim()) {
            output = { ok: false, error: "text is required" };
          } else {
            optionsRef.current.onSetAgentChatDraft?.(textArg);
            output = { ok: true, draft: textArg };
          }
        } else if (toolCall.name === "submit_focused_form") {
          if (!optionsRef.current.onSubmitFocusedForm) {
            output = {
              ok: false,
              error: "focused form submit is unavailable",
            };
          } else {
            await optionsRef.current.onSubmitFocusedForm();
            output = { ok: true, submitted: true };
          }
        } else {
          const draft = (
            textArg ??
            optionsRef.current.getAgentChatDraft?.() ??
            ""
          ).trim();
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
    [stop],
  );

  const updateRealtimeVadMode = useCallback((mode: "ambient" | "playback") => {
    if (realtimeVadModeRef.current === mode) return;

    const dataChannel = dataChannelRef.current;
    if (!dataChannel || dataChannel.readyState !== "open") return;

    const turnDetection =
      mode === "playback"
        ? REALTIME_PLAYBACK_TURN_DETECTION
        : REALTIME_AMBIENT_TURN_DETECTION;
    dataChannel.send(
      JSON.stringify(buildRealtimeVadSessionUpdate(turnDetection)),
    );
    realtimeVadModeRef.current = mode;
  }, []);

  const handleRealtimeEvent = useCallback(
    (rawData: unknown) => {
      let parsed: unknown = rawData;
      if (typeof rawData === "string") {
        try {
          parsed = JSON.parse(rawData) as unknown;
        } catch {
          return;
        }
      }

      if (isAssistantAudioPlaybackStart(parsed)) {
        updateRealtimeVadMode("playback");
      } else if (isAssistantAudioPlaybackDone(parsed)) {
        updateRealtimeVadMode("ambient");
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
    },
    [appendTranscript, handleRealtimeToolCall, updateRealtimeVadMode],
  );

  const start = useCallback(async () => {
    if (!client) {
      setError("ログイン後に音声会話を開始できます。");
      playCue("error");
      return;
    }
    if (
      status !== "idle" ||
      startInFlightRef.current ||
      peerConnectionRef.current ||
      mediaStreamRef.current
    ) {
      return;
    }

    startInFlightRef.current = true;
    setError(null);
    setStatus("connecting");
    transcriptTextByIdRef.current.clear();
    setTranscripts([]);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("media devices are not available");
      }

      const agentChatContext = optionsRef.current.getAgentChatContext?.();
      const realtimeInstructions =
        optionsRef.current.instructions ?? REALTIME_AGENT_CHAT_INSTRUCTIONS;
      const secret = await client.issueRealtimeClientSecret({
        voice: "marin",
        instruction_preset: "cowork_assistant",
        transcription: "ja",
        vad: REALTIME_VAD_PRESET,
        ...buildRealtimeToolSessionConfigWithInstructions(
          realtimeInstructions,
          agentChatContext,
          optionsRef.current.instructions
            ? "Current context for this Realtime session"
            : undefined,
        ),
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

      const markReadyIfConversationCanStart = () => {
        if (
          pc.connectionState !== "connected" ||
          dataChannelRef.current?.readyState !== "open"
        ) {
          return;
        }

        setStatus("connected");
        if (!playedConnectedCueRef.current) {
          playedConnectedCueRef.current = true;
          playCue("ready");
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          markReadyIfConversationCanStart();
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
        audio: buildRealtimeAudioConstraints(),
      });
      mediaStreamRef.current = stream;
      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream);
      }

      const dataChannel = pc.createDataChannel("oai-events");
      dataChannelRef.current = dataChannel;
      dataChannel.onopen = () => {
        dataChannel.send(
          JSON.stringify({
            type: "session.update",
            session: buildRealtimeToolSessionConfigWithInstructions(
              realtimeInstructions,
              agentChatContext,
              optionsRef.current.instructions
                ? "Current context for this Realtime session"
                : undefined,
            ),
          }),
        );
        markReadyIfConversationCanStart();
      };
      dataChannel.onerror = () => {
        setError("音声会話の接続でエラーが発生しました。再接続してください。");
        playCue("error");
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
      playCue("error");
      console.error("Failed to start realtime voice", err);
      setError(toUserFacingRealtimeError(err));
    } finally {
      startInFlightRef.current = false;
    }
  }, [client, handleRealtimeEvent, playCue, status, stop]);

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
