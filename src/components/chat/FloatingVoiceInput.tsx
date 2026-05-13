import { useCallback, useEffect, useRef } from "react";
import { useWindowDrag } from "../../hooks/useWindowDrag";
import type { useRealtimeVoice } from "../../hooks/useRealtimeVoice";
import {
  hideCurrentTauriWindow,
  interceptCurrentTauriWindowClose,
  listenFloatingVoiceHoldStart,
  listenFloatingVoiceHoldStop,
  listenFloatingVoiceStart,
  listenFloatingVoiceStopAndHide,
  listenFloatingVoiceToggle,
  resizeCurrentFloatingVoiceInputWindow,
} from "../../lib/tauri-bridge";

type Props = {
  isEnabled: boolean;
  onEnable: () => void;
  realtimeVoice: ReturnType<typeof useRealtimeVoice>;
};

export function FloatingVoiceInput({
  isEnabled,
  onEnable,
  realtimeVoice,
}: Props) {
  const handleWindowDrag = useWindowDrag();
  const realtimeVoiceRef = useRef(realtimeVoice);
  const isEnabledRef = useRef(isEnabled);
  const onEnableRef = useRef(onEnable);
  const status = realtimeVoice.status;
  const isConnecting = status === "connecting";
  const isConnected = status === "connected";
  const isActive = isConnecting || isConnected;

  useEffect(() => {
    realtimeVoiceRef.current = realtimeVoice;
    isEnabledRef.current = isEnabled;
    onEnableRef.current = onEnable;
  }, [isEnabled, onEnable, realtimeVoice]);

  useEffect(() => {
    document.documentElement.classList.add("voice-input-transparent");
    document.body.classList.add("voice-input-transparent");
    return () => {
      document.documentElement.classList.remove("voice-input-transparent");
      document.body.classList.remove("voice-input-transparent");
    };
  }, []);

  useEffect(() => {
    void resizeCurrentFloatingVoiceInputWindow(isActive).catch((error) => {
      console.warn("Failed to resize Voice Dot window.", error);
    });
  }, [isActive]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void interceptCurrentTauriWindowClose(() => {
      realtimeVoiceRef.current.stop();
    }).then((fn) => {
      if (disposed) {
        fn();
        return;
      }
      unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const startVoice = useCallback(async () => {
    const currentRealtimeVoice = realtimeVoiceRef.current;
    if (
      currentRealtimeVoice.status === "connecting" ||
      currentRealtimeVoice.status === "connected"
    ) {
      return;
    }

    if (!isEnabledRef.current) {
      onEnableRef.current();
    }

    await currentRealtimeVoice.start();
  }, []);

  const stopVoice = useCallback(() => {
    realtimeVoiceRef.current.stop();
  }, []);

  const toggleVoice = useCallback(async () => {
    const currentRealtimeVoice = realtimeVoiceRef.current;
    if (
      currentRealtimeVoice.status === "connecting" ||
      currentRealtimeVoice.status === "connected"
    ) {
      currentRealtimeVoice.stop();
      return;
    }

    await startVoice();
  }, [startVoice]);

  useEffect(() => {
    let disposed = false;
    const unlisteners: Array<() => void> = [];
    const listeners = [
      listenFloatingVoiceStart(() => {
        void startVoice();
      }),
      listenFloatingVoiceToggle(() => {
        void toggleVoice();
      }),
      listenFloatingVoiceHoldStart(() => {
        void startVoice();
      }),
      listenFloatingVoiceHoldStop(() => {
        stopVoice();
      }),
    ];

    for (const listener of listeners) {
      void listener.then((fn) => {
        if (disposed) {
          fn();
          return;
        }
        unlisteners.push(fn);
      });
    }

    return () => {
      disposed = true;
      for (const unlisten of unlisteners) {
        unlisten();
      }
    };
  }, [startVoice, stopVoice, toggleVoice]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listenFloatingVoiceStopAndHide(() => {
      stopVoice();
      void hideCurrentTauriWindow();
    }).then((fn) => {
      if (disposed) {
        fn();
        return;
      }
      unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [stopVoice]);

  return (
    <div
      className={[
        "flex h-screen w-screen items-center justify-center gap-0.5 overflow-hidden rounded-full bg-stone-950 shadow-[0_5px_14px_rgba(0,0,0,0.26)] ring-1 ring-white/12 dark:bg-stone-950 dark:ring-white/10",
        isConnected
          ? "ring-white/20"
          : isConnecting
            ? "bg-stone-900 ring-white/16 dark:bg-stone-900"
            : "",
      ].join(" ")}
      onMouseDown={handleWindowDrag}
      aria-label="Voice Dot"
    >
      {isActive &&
        Array.from({ length: 5 }, (_, index) => (
          <span
            key={index}
            className={[
              "h-1.5 w-1.5 rounded-full",
              isConnected ? "voice-dot-wave" : "animate-pulse",
              isConnected ? "bg-white/90" : "bg-stone-400/85",
            ].join(" ")}
            style={
              isConnected ? { animationDelay: `${index * 90}ms` } : undefined
            }
          />
        ))}
    </div>
  );
}
