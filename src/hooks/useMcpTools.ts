import { useCallback, useEffect, useState } from "react";
import type { ClientToolDefinition } from "../lib/types";
import { isTauri, mcpGetTools } from "../lib/tauri-bridge";

const MCP_TOOLS_REPLACED_BY_AGENT_BUILTINS = new Set([
  "mcp_web_search_web_search",
  "mcp_web_search_fetch_webpage",
]);

export function useMcpTools(activeProjectPath?: string | null) {
  const [mcpTools, setMcpTools] = useState<ClientToolDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isTauri()) return;
    setIsLoading(true);
    try {
      const tools = await mcpGetTools();
      setMcpTools(
        tools
          .filter(
            (t) => !MCP_TOOLS_REPLACED_BY_AGENT_BUILTINS.has(t.namespaced_name),
          )
          .map((t) => ({
            name: t.namespaced_name,
            description:
              `[${t.server_name}] ${t.description}` +
              (activeProjectPath
                ? ` Current project: ${activeProjectPath}. Relative paths should resolve from this directory.`
                : " No active project is selected yet."),
            parameters: t.input_schema,
          })),
      );
    } catch (e) {
      console.error("Failed to fetch MCP tools:", e);
    } finally {
      setIsLoading(false);
    }
  }, [activeProjectPath]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { mcpTools, refreshMcpTools: refresh, isLoading };
}
