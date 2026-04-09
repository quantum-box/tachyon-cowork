import { useCallback, useEffect, useState } from "react";
import {
  isTauri,
  projectGetActiveContext,
  projectInitializeActive,
  projectUpdateActiveSummary,
  type ProjectContext,
} from "../lib/tauri-bridge";

export function useProjectContext(activeProjectPath?: string | null) {
  const [context, setContext] = useState<ProjectContext | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
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

  const initializeContext = useCallback(async () => {
    if (!isTauri() || !activeProjectPath) return null;

    setIsInitializing(true);
    try {
      const next = await projectInitializeActive();
      setContext(next);
      setError(null);
      return next;
    } catch (err) {
      console.error("Failed to initialize project context:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to initialize project context",
      );
      return null;
    } finally {
      setIsInitializing(false);
    }
  }, [activeProjectPath]);

  const saveSummary = useCallback(
    async (summary: string) => {
      if (!isTauri() || !activeProjectPath) return null;

      setIsInitializing(true);
      try {
        const next = await projectUpdateActiveSummary(summary);
        setContext(next);
        setError(null);
        return next;
      } catch (err) {
        console.error("Failed to save work guidance:", err);
        setError(
          err instanceof Error ? err.message : "Failed to save work guidance",
        );
        return null;
      } finally {
        setIsInitializing(false);
      }
    },
    [activeProjectPath],
  );

  useEffect(() => {
    refreshContext();
  }, [refreshContext]);

  useEffect(() => {
    if (
      !activeProjectPath ||
      !context ||
      context.is_initialized ||
      isInitializing
    ) {
      return;
    }
    initializeContext();
  }, [activeProjectPath, context, initializeContext, isInitializing]);

  return {
    context,
    isLoading,
    isInitializing,
    error,
    refreshContext,
    initializeContext,
    saveSummary,
  };
}
