import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mcpGetTools } from "../../lib/tauri-bridge";
import { useMcpTools } from "../useMcpTools";

vi.mock("../../lib/tauri-bridge", () => ({
  isTauri: vi.fn(() => true),
  mcpGetTools: vi.fn(),
}));

describe("useMcpTools", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("omits MCP web search tools because Agent API has built-in web search and URL fetch", async () => {
    vi.mocked(mcpGetTools).mockResolvedValue([
      {
        namespaced_name: "mcp_web_search_web_search",
        original_name: "web_search",
        server_id: "web_search",
        server_name: "Web Search",
        description: "Search the web",
        input_schema: { type: "object" },
      },
      {
        namespaced_name: "mcp_web_search_fetch_webpage",
        original_name: "fetch_webpage",
        server_id: "web_search",
        server_name: "Web Search",
        description: "Fetch a webpage",
        input_schema: { type: "object" },
      },
    ]);

    const { result } = renderHook(() => useMcpTools("/tmp/project"));

    await waitFor(() =>
      expect(result.current.mcpTools.map((tool) => tool.name)).toEqual([]),
    );
  });
});
