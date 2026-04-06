import { useCallback, useState } from "react";

export type SendKeyMode = "enter" | "cmd-enter";

const STORAGE_KEY = "tachyon-cowork-send-key";

function loadSendKey(): SendKeyMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "cmd-enter" ? "cmd-enter" : "enter";
}

export function useSendKey() {
  const [sendKey, setSendKeyState] = useState<SendKeyMode>(loadSendKey);

  const setSendKey = useCallback((mode: SendKeyMode) => {
    localStorage.setItem(STORAGE_KEY, mode);
    setSendKeyState(mode);
  }, []);

  return { sendKey, setSendKey } as const;
}
