import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentChatClient } from "../lib/api-client";

export type RealtimeVoiceStatus = "idle" | "connecting" | "connected";

type RealtimeVoiceState = {
  status: RealtimeVoiceStatus;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  clearError: () => void;
};

const OPENAI_REALTIME_CALL_URL = "https://api.openai.com/v1/realtime/calls";

function toUserFacingRealtimeError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "音声会話を開始できませんでした。少し待ってから再試行してください。";
  }

  const message = error.message.toLowerCase();
  if (
    message.includes("permission") ||
    message.includes("notallowed") ||
    message.includes("denied")
  ) {
    return "マイクの利用が許可されていません。端末の設定でマイク権限を許可してください。";
  }
  if (message.includes("notfound") || message.includes("device")) {
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
): RealtimeVoiceState {
  const [status, setStatus] = useState<RealtimeVoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
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

    setStatus("idle");
  }, []);

  const start = useCallback(async () => {
    if (!client) {
      setError("ログイン後に音声会話を開始できます。");
      return;
    }
    if (status !== "idle") return;

    setError(null);
    setStatus("connecting");

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
      dataChannel.onerror = () => {
        setError("音声会話の接続でエラーが発生しました。再接続してください。");
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch(OPENAI_REALTIME_CALL_URL, {
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
          `Realtime SDP exchange failed: ${sdpResponse.status} ${body}`,
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
  }, [client, status, stop]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  useEffect(() => stop, [stop]);

  return { status, error, start, stop, clearError };
}
