import { useCallback, useState } from "react";
import type { RealtimeVoiceMode } from "../lib/types";

const STORAGE_KEY = "tachyon-cowork-realtime-voice-enabled";
const SOUND_STORAGE_KEY = "tachyon-cowork-realtime-sound-enabled";
const FLOATING_VOICE_OPEN_ON_STARTUP_STORAGE_KEY =
  "tachyon-cowork-floating-voice-open-on-startup";
const VOICE_DOT_MENU_BAR_ICON_STORAGE_KEY =
  "tachyon-cowork-voice-dot-menu-bar-icon-enabled";
const REALTIME_VOICE_MODE_STORAGE_KEY = "tachyon-cowork-realtime-voice-mode";
const VOICE_DOT_SHORT_PRESS_MODE_STORAGE_KEY =
  "tachyon-cowork-voice-dot-short-press-mode";
const VOICE_DOT_LONG_PRESS_MODE_STORAGE_KEY =
  "tachyon-cowork-voice-dot-long-press-mode";

export const REALTIME_VOICE_MODE_MODEL_MAP = {
  conversation: "gpt-realtime-2",
  translate: "gpt-realtime-translate",
  whisper: "gpt-realtime-whisper",
} as const satisfies Record<RealtimeVoiceMode, string>;

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

export function resolveRealtimeVoiceMode(
  value: string | null | undefined,
): RealtimeVoiceMode {
  if (value === "translate" || value === "whisper") return value;
  return "conversation";
}

function loadRealtimeVoiceMode(): RealtimeVoiceMode {
  if (typeof window === "undefined") return "conversation";
  return resolveRealtimeVoiceMode(
    localStorage.getItem(REALTIME_VOICE_MODE_STORAGE_KEY),
  );
}

function loadVoiceDotShortPressMode(): RealtimeVoiceMode {
  if (typeof window === "undefined") return "conversation";
  return resolveRealtimeVoiceMode(
    localStorage.getItem(VOICE_DOT_SHORT_PRESS_MODE_STORAGE_KEY),
  );
}

function loadVoiceDotLongPressMode(): RealtimeVoiceMode {
  if (typeof window === "undefined") return "whisper";
  return resolveRealtimeVoiceMode(
    localStorage.getItem(VOICE_DOT_LONG_PRESS_MODE_STORAGE_KEY) ?? "whisper",
  );
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
  const [realtimeVoiceMode, setRealtimeVoiceModeState] = useState(
    loadRealtimeVoiceMode,
  );
  const [voiceDotShortPressMode, setVoiceDotShortPressModeState] = useState(
    loadVoiceDotShortPressMode,
  );
  const [voiceDotLongPressMode, setVoiceDotLongPressModeState] = useState(
    loadVoiceDotLongPressMode,
  );

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

  const setRealtimeVoiceMode = useCallback((mode: RealtimeVoiceMode) => {
    localStorage.setItem(REALTIME_VOICE_MODE_STORAGE_KEY, mode);
    setRealtimeVoiceModeState(mode);
  }, []);

  const setVoiceDotShortPressMode = useCallback((mode: RealtimeVoiceMode) => {
    localStorage.setItem(VOICE_DOT_SHORT_PRESS_MODE_STORAGE_KEY, mode);
    setVoiceDotShortPressModeState(mode);
  }, []);

  const setVoiceDotLongPressMode = useCallback((mode: RealtimeVoiceMode) => {
    localStorage.setItem(VOICE_DOT_LONG_PRESS_MODE_STORAGE_KEY, mode);
    setVoiceDotLongPressModeState(mode);
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
    realtimeVoiceMode,
    setRealtimeVoiceMode,
    voiceDotShortPressMode,
    setVoiceDotShortPressMode,
    voiceDotLongPressMode,
    setVoiceDotLongPressMode,
  } as const;
}
