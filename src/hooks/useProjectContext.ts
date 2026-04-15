import { useCallback, useEffect, useState } from "react";
import {
  isTauri,
  projectGetActiveContext,
  projectUpdateActiveCustomInstructions,
  type ProjectContext,
} from "../lib/tauri-bridge";

export function useProjectContext(activeProjectPath?: string | null) {
  const [context, setContext] = useState<ProjectContext | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshContext = useCallback(async () => {
    if (!isTauri() || !activeProjectPath) {
      setContext(null);
      setError(null);
      return;
    }

    setIsLoading(true);
    try {
      const next = await projectGetActiveContext();
      setContext(next);
      setError(null);
    } catch (err) {
      console.error("Failed to load project context:", err);
      setContext(null);
      setError(
        err instanceof Error ? err.message : "Failed to load project context",
      );
    } finally {
      setIsLoading(false);
    }
  }, [activeProjectPath]);

  const saveCustomInstructions = useCallback(
    async (customInstructions: string) => {
      if (!isTauri() || !activeProjectPath) return null;

      setIsSaving(true);
      try {
        const next =
          await projectUpdateActiveCustomInstructions(customInstructions);
        setContext(next);
        setError(null);
        return next;
      } catch (err) {
        console.error("Failed to save workspace custom instructions:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Failed to save workspace custom instructions",
        );
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [activeProjectPath],
  );

  useEffect(() => {
    refreshContext();
  }, [refreshContext]);

  return {
    context,
    isLoading,
    isSaving,
    error,
    refreshContext,
    saveCustomInstructions,
  };
}
