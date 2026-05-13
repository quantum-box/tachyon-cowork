import { useCallback, useState } from "react";

const STORAGE_KEY = "tachyon-cowork-realtime-voice-enabled";
const SOUND_STORAGE_KEY = "tachyon-cowork-realtime-sound-enabled";
const FLOATING_VOICE_OPEN_ON_STARTUP_STORAGE_KEY =
  "tachyon-cowork-floating-voice-open-on-startup";
const VOICE_DOT_MENU_BAR_ICON_STORAGE_KEY =
  "tachyon-cowork-voice-dot-menu-bar-icon-enabled";

function loadRealtimeVoiceEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(STORAGE_KEY) !== "false";
}

function loadRealtimeSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(SOUND_STORAGE_KEY) !== "false";
}

function loadFloatingVoiceOpenOnStartup(): boolean {
  if (typeof window === "undefined") return false;
  return (
    localStorage.getItem(FLOATING_VOICE_OPEN_ON_STARTUP_STORAGE_KEY) === "true"
  );
}

function loadVoiceDotMenuBarIconEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(VOICE_DOT_MENU_BAR_ICON_STORAGE_KEY) !== "false";
}

export function useRealtimeVoiceSettings() {
  const [realtimeVoiceEnabled, setRealtimeVoiceEnabledState] = useState(
    loadRealtimeVoiceEnabled,
  );
  const [realtimeSoundEnabled, setRealtimeSoundEnabledState] = useState(
    loadRealtimeSoundEnabled,
  );
  const [floatingVoiceOpenOnStartup, setFloatingVoiceOpenOnStartupState] =
    useState(loadFloatingVoiceOpenOnStartup);
  const [voiceDotMenuBarIconEnabled, setVoiceDotMenuBarIconEnabledState] =
    useState(loadVoiceDotMenuBarIconEnabled);

  const setRealtimeVoiceEnabled = useCallback((enabled: boolean) => {
    localStorage.setItem(STORAGE_KEY, String(enabled));
    setRealtimeVoiceEnabledState(enabled);
  }, []);

  const setRealtimeSoundEnabled = useCallback((enabled: boolean) => {
    localStorage.setItem(SOUND_STORAGE_KEY, String(enabled));
    setRealtimeSoundEnabledState(enabled);
  }, []);

  const setFloatingVoiceOpenOnStartup = useCallback((enabled: boolean) => {
    localStorage.setItem(
      FLOATING_VOICE_OPEN_ON_STARTUP_STORAGE_KEY,
      String(enabled),
    );
    setFloatingVoiceOpenOnStartupState(enabled);
  }, []);

  const setVoiceDotMenuBarIconEnabled = useCallback((enabled: boolean) => {
    localStorage.setItem(VOICE_DOT_MENU_BAR_ICON_STORAGE_KEY, String(enabled));
    setVoiceDotMenuBarIconEnabledState(enabled);
  }, []);

  return {
    realtimeVoiceEnabled,
    setRealtimeVoiceEnabled,
    realtimeSoundEnabled,
    setRealtimeSoundEnabled,
    floatingVoiceOpenOnStartup,
    setFloatingVoiceOpenOnStartup,
    voiceDotMenuBarIconEnabled,
    setVoiceDotMenuBarIconEnabled,
  } as const;
}
