import { useEffect } from 'react';

interface ShortcutHandlers {
  onNewChat?: () => void;
  onSearch?: () => void;
  onSettings?: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;

      if (isMod && e.key === 'n') {
        e.preventDefault();
        handlers.onNewChat?.();
      }

      if (isMod && e.key === 'f') {
        // Only if not already in an input
        if (
          document.activeElement?.tagName !== 'INPUT' &&
          document.activeElement?.tagName !== 'TEXTAREA'
        ) {
          e.preventDefault();
          handlers.onSearch?.();
        }
      }

      if (e.key === 'Escape') {
        handlers.onSettings?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
}
