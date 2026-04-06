import { useCallback, useEffect, useState } from "react";
import {
  isTauri,
  projectGetState,
  projectRemoveRecent,
  projectSetActive,
  type ProjectState,
} from "../lib/tauri-bridge";

const EMPTY_STATE: ProjectState = {
  active_project: null,
  recent_projects: [],
};

export function useProjectState() {
  const [state, setState] = useState<ProjectState>(EMPTY_STATE);
  const [isLoading, setIsLoading] = useState(false);

  const refreshProjects = useCallback(async () => {
    if (!isTauri()) {
      setState(EMPTY_STATE);
      return;
    }
    setIsLoading(true);
    try {
      setState(await projectGetState());
    } catch (error) {
      console.error("Failed to fetch project state:", error);
      setState(EMPTY_STATE);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  const activateProject = useCallback(async (path: string) => {
    if (!isTauri()) return;
    setIsLoading(true);
    try {
      setState(await projectSetActive(path));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const removeProject = useCallback(async (path: string) => {
    if (!isTauri()) return;
    setIsLoading(true);
    try {
      setState(await projectRemoveRecent(path));
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    activeProject: state.active_project,
    recentProjects: state.recent_projects,
    isLoading,
    activateProject,
    removeProject,
    refreshProjects,
  };
}
