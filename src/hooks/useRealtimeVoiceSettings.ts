import { useCallback, useState } from "react";

const STORAGE_KEY = "tachyon-cowork-realtime-voice-enabled";

function loadRealtimeVoiceEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(STORAGE_KEY) !== "false";
}

export function useRealtimeVoiceSettings() {
  const [realtimeVoiceEnabled, setRealtimeVoiceEnabledState] = useState(
    loadRealtimeVoiceEnabled,
  );

  const setRealtimeVoiceEnabled = useCallback((enabled: boolean) => {
    localStorage.setItem(STORAGE_KEY, String(enabled));
    setRealtimeVoiceEnabledState(enabled);
  }, []);

  return { realtimeVoiceEnabled, setRealtimeVoiceEnabled } as const;
}
