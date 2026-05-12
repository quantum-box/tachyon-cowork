import { useCallback, useState } from "react";

const STORAGE_KEY = "tachyon-cowork-realtime-voice-enabled";
const SOUND_STORAGE_KEY = "tachyon-cowork-realtime-sound-enabled";

function loadRealtimeVoiceEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(STORAGE_KEY) !== "false";
}

function loadRealtimeSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(SOUND_STORAGE_KEY) !== "false";
}

export function useRealtimeVoiceSettings() {
  const [realtimeVoiceEnabled, setRealtimeVoiceEnabledState] = useState(
    loadRealtimeVoiceEnabled,
  );
  const [realtimeSoundEnabled, setRealtimeSoundEnabledState] = useState(
    loadRealtimeSoundEnabled,
  );

  const setRealtimeVoiceEnabled = useCallback((enabled: boolean) => {
    localStorage.setItem(STORAGE_KEY, String(enabled));
    setRealtimeVoiceEnabledState(enabled);
  }, []);

  const setRealtimeSoundEnabled = useCallback((enabled: boolean) => {
    localStorage.setItem(SOUND_STORAGE_KEY, String(enabled));
    setRealtimeSoundEnabledState(enabled);
  }, []);

  return {
    realtimeVoiceEnabled,
    setRealtimeVoiceEnabled,
    realtimeSoundEnabled,
    setRealtimeSoundEnabled,
  } as const;
}
