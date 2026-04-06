import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Terminal, Globe, Package, ChevronDown, ChevronRight } from "lucide-react";
import {
  isTauri,
  mcpAddServer,
  mcpRemoveServer,
  mcpToggleServer,
  mcpGetServerStatuses,
  mcpToggleBuiltinApp,
  mcpGetBuiltinApps,
  type McpServerConfig,
  type McpServerStatus,
  type McpTransportConfig,
  type BuiltinAppInfo,
} from "../../lib/tauri-bridge";

type Props = {
  onConfigChanged?: () => void;
};

export function McpSettingsSection({ onConfigChanged }: Props) {
  const [statuses, setStatuses] = useState<McpServerStatus[]>([]);
  const [builtinAppInfos, setBuiltinAppInfos] = useState<BuiltinAppInfo[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [expandedApps, setExpandedApps] = useState<Set<string>>(new Set());

  // Form state
  const [name, setName] = useState("");
  const [transportType, setTransportType] = useState<"stdio" | "sse">("stdio");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [url, setUrl] = useState("");

  const refreshStatuses = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const [s, apps] = await Promise.all([mcpGetServerStatuses(), mcpGetBuiltinApps()]);
      setStatuses(s);
      setBuiltinAppInfos(apps);
    } catch (e) {
      console.error("Failed to fetch MCP statuses:", e);
    }
  }, []);

  useEffect(() => {
    refreshStatuses();
  }, [refreshStatuses]);

  const builtinApps = statuses.filter((s) => s.builtin);
  const externalServers = statuses.filter((s) => !s.builtin);

  const handleAdd = async () => {
    if (!name.trim()) return;
    setLoading(true);

    let transport: McpTransportConfig;
    if (transportType === "stdio") {
      if (!command.trim()) {
        setLoading(false);
        return;
      }
      transport = {
        type: "stdio",
        command: command.trim(),
        args: args.split(/\s+/).filter((a) => a.length > 0),
        env: {},
      };
    } else {
      if (!url.trim()) {
        setLoading(false);
        return;
      }
      transport = {
        type: "sse",
        url: url.trim(),
        headers: {},
      };
    }

    const server: McpServerConfig = {
      id: crypto.randomUUID(),
      name: name.trim(),
      enabled: true,
      transport,
      builtin: false,
    };

    try {
      await mcpAddServer(server);
      resetForm();
      await refreshStatuses();
      onConfigChanged?.();
    } catch (e) {
      console.error("Failed to add MCP server:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (serverId: string) => {
    try {
      await mcpRemoveServer(serverId);
      await refreshStatuses();
      onConfigChanged?.();
    } catch (e) {
      console.error("Failed to remove MCP server:", e);
    }
  };

  const handleToggle = async (serverId: string, enabled: boolean) => {
    try {
      await mcpToggleServer(serverId, enabled);
      await refreshStatuses();
      onConfigChanged?.();
    } catch (e) {
      console.error("Failed to toggle MCP server:", e);
    }
  };

  const handleToggleBuiltin = async (appId: string, enabled: boolean) => {
    try {
      await mcpToggleBuiltinApp(appId, enabled);
      await refreshStatuses();
      onConfigChanged?.();
    } catch (e) {
      console.error("Failed to toggle built-in app:", e);
    }
  };

  const toggleExpanded = (appId: string) => {
    setExpandedApps((prev) => {
      const next = new Set(prev);
      if (next.has(appId)) {
        next.delete(appId);
      } else {
        next.add(appId);
      }
      return next;
    });
  };

  const resetForm = () => {
    setShowForm(false);
    setName("");
    setCommand("");
    setArgs("");
    setUrl("");
    setTransportType("stdio");
  };

  if (!isTauri()) {
    return (
      <p className="text-xs text-gray-500 dark:text-gray-400">
        MCP servers are only available in the desktop app.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Built-in Apps */}
      {builtinApps.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            <Package size={12} />
            Built-in Apps
          </div>

          {builtinApps.map((app) => (
            <div key={app.id} className="space-y-0">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700">
                {/* Expand toggle */}
                <button
                  onClick={() => toggleExpanded(app.id)}
                  className="shrink-0 p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  {expandedApps.has(app.id) ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                </button>

                {/* Status dot */}
                <span
                  className={`shrink-0 w-2 h-2 rounded-full ${
                    app.enabled ? "bg-emerald-500" : "bg-gray-400 dark:bg-slate-500"
                  }`}
                />

                {/* Name + description */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                    {app.name}
                  </div>
                  {app.description && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {app.description}
                    </div>
                  )}
                </div>

                {/* Tool count */}
                <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">
                  {app.tool_count} tools
                </span>

                {/* Toggle */}
                <button
                  onClick={() => handleToggleBuiltin(app.id, !app.enabled)}
                  className={`shrink-0 relative w-8 h-[18px] rounded-full transition-colors ${
                    app.enabled ? "bg-indigo-500" : "bg-gray-300 dark:bg-slate-600"
                  }`}
                >
                  <span
                    className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform ${
                      app.enabled ? "left-[15px]" : "left-[2px]"
                    }`}
                  />
                </button>
              </div>

              {/* Expanded tool list */}
              {expandedApps.has(app.id) &&
                (() => {
                  const appInfo = builtinAppInfos.find((a) => a.id === app.id);
                  if (!appInfo) return null;
                  return (
                    <div className="ml-7 mt-1 mb-1 px-3 py-2 rounded-md bg-gray-100 dark:bg-slate-800/50 border border-gray-150 dark:border-slate-700/50">
                      <div className="space-y-1.5">
                        {appInfo.tools.map((tool) => (
                          <div key={tool.name} className="text-xs flex items-start gap-1.5">
                            <span className="w-1 h-1 mt-1.5 rounded-full bg-gray-400 dark:bg-gray-500 shrink-0" />
                            <div>
                              <span className="font-mono text-gray-700 dark:text-gray-300">
                                {tool.name}
                              </span>
                              <span className="text-gray-400 dark:text-gray-500 ml-1.5">
                                {tool.description}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
            </div>
          ))}
        </div>
      )}

      {/* External Servers */}
      <div className="space-y-2">
        {builtinApps.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            <Globe size={12} />
            External Servers
          </div>
        )}

        {externalServers.length === 0 && !showForm && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            No external MCP servers configured.
          </p>
        )}

        {externalServers.map((s) => (
          <div
            key={s.id}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700"
          >
            {/* Status dot */}
            <span
              className={`shrink-0 w-2 h-2 rounded-full ${
                s.connected
                  ? "bg-emerald-500"
                  : s.enabled && s.error
                    ? "bg-red-500"
                    : "bg-gray-400 dark:bg-slate-500"
              }`}
            />

            {/* Name + info */}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                {s.name}
              </div>
              {s.connected && (
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {s.tool_count} tool{s.tool_count !== 1 ? "s" : ""}
                </div>
              )}
              {s.error && (
                <div className="text-xs text-red-500 dark:text-red-400 truncate">{s.error}</div>
              )}
            </div>

            {/* Toggle */}
            <button
              onClick={() => handleToggle(s.id, !s.enabled)}
              className={`shrink-0 relative w-8 h-[18px] rounded-full transition-colors ${
                s.enabled ? "bg-indigo-500" : "bg-gray-300 dark:bg-slate-600"
              }`}
            >
              <span
                className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform ${
                  s.enabled ? "left-[15px]" : "left-[2px]"
                }`}
              />
            </button>

            {/* Delete */}
            <button
              onClick={() => handleRemove(s.id)}
              className="shrink-0 p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-400 hover:text-red-500 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}

        {/* Add server form */}
        {showForm ? (
          <div className="space-y-2 px-3 py-3 rounded-lg bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Server name"
              className="w-full text-sm px-2.5 py-1.5 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 outline-none focus:border-indigo-500 transition-colors"
            />

            {/* Transport type selector */}
            <div className="flex gap-2">
              <button
                onClick={() => setTransportType("stdio")}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  transportType === "stdio"
                    ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700"
                    : "bg-white dark:bg-slate-900 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-slate-600"
                }`}
              >
                <Terminal size={12} />
                stdio
              </button>
              <button
                onClick={() => setTransportType("sse")}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  transportType === "sse"
                    ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700"
                    : "bg-white dark:bg-slate-900 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-slate-600"
                }`}
              >
                <Globe size={12} />
                SSE / HTTP
              </button>
            </div>

            {transportType === "stdio" ? (
              <>
                <input
                  type="text"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="Command (e.g. npx)"
                  className="w-full text-sm px-2.5 py-1.5 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 outline-none focus:border-indigo-500 transition-colors font-mono"
                />
                <input
                  type="text"
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                  placeholder="Arguments (space-separated)"
                  className="w-full text-sm px-2.5 py-1.5 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 outline-none focus:border-indigo-500 transition-colors font-mono"
                />
              </>
            ) : (
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Server URL (e.g. http://localhost:3001/mcp)"
                className="w-full text-sm px-2.5 py-1.5 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 outline-none focus:border-indigo-500 transition-colors font-mono"
              />
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleAdd}
                disabled={loading}
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {loading ? "Connecting..." : "Add"}
              </button>
              <button
                onClick={resetForm}
                className="px-3 py-1.5 rounded-md text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
          >
            <Plus size={14} />
            Add MCP Server
          </button>
        )}
      </div>
    </div>
  );
}
