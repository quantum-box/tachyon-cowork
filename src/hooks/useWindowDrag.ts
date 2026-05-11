import { useCallback, type MouseEvent } from "react";
import { startTauriWindowDrag } from "../lib/tauri-bridge";

const WINDOW_DRAG_EXCLUDE_SELECTOR =
  "button, a, input, textarea, select, [role='button'], [contenteditable='true'], [data-window-drag-exclude]";

export function useWindowDrag() {
  return useCallback((event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }

    if (
      event.target instanceof HTMLElement &&
      event.target.closest(WINDOW_DRAG_EXCLUDE_SELECTOR)
    ) {
      return;
    }

    event.preventDefault();
    void startTauriWindowDrag().catch((error) => {
      console.warn("Failed to start window drag", error);
    });
  }, []);
}
