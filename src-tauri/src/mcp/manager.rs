use std::collections::HashMap;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;
use tokio::sync::Mutex;

use super::{
    apps,
    client::McpClientSession,
    config::{McpConfig, McpServerStatus, McpToolInfo},
};

const STORE_KEY: &str = "mcp-config";
const STORE_FILE: &str = "mcp-config.json";

pub struct McpManager {
    sessions: Mutex<HashMap<String, McpClientSession>>,
    config: Mutex<McpConfig>,
    errors: Mutex<HashMap<String, String>>,
}

impl McpManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            config: Mutex::new(McpConfig::default()),
            errors: Mutex::new(HashMap::new()),
        }
    }

    pub async fn load_and_connect_all(&self, app: &AppHandle) -> Result<(), String> {
        let config = self.load_config(app)?;
        *self.config.lock().await = config;
        self.connect_all_enabled().await;
        Ok(())
    }

    fn load_config(&self, app: &AppHandle) -> Result<McpConfig, String> {
        let store = app
            .store(STORE_FILE)
            .map_err(|e| format!("Failed to open store: {}", e))?;

        match store.get(STORE_KEY) {
            Some(value) => serde_json::from_value(value.clone())
                .map_err(|e| format!("Failed to parse MCP config: {}", e)),
            None => Ok(McpConfig::default()),
        }
    }

    pub async fn save_config(&self, app: &AppHandle) -> Result<(), String> {
        let config = self.config.lock().await;
        let store = app
            .store(STORE_FILE)
            .map_err(|e| format!("Failed to open store: {}", e))?;

        let value = serde_json::to_value(&*config)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;
        store.set(STORE_KEY, value);
        store
            .save()
            .map_err(|e| format!("Failed to save store: {}", e))?;
        Ok(())
    }

    pub async fn get_config(&self) -> McpConfig {
        self.config.lock().await.clone()
    }

    pub async fn set_config(&self, config: McpConfig) {
        *self.config.lock().await = config;
    }

    pub async fn connect_server(&self, server_id: &str) -> Result<(), String> {
        let config = self.config.lock().await;
        let server = config
            .servers
            .iter()
            .find(|s| s.id == server_id)
            .ok_or_else(|| format!("Server not found: {}", server_id))?
            .clone();
        drop(config);

        // Disconnect existing session if any
        self.disconnect_server(server_id).await;

        match McpClientSession::connect(server.id.clone(), server.name.clone(), &server.transport)
            .await
        {
            Ok(session) => {
                self.errors.lock().await.remove(server_id);
                self.sessions
                    .lock()
                    .await
                    .insert(server_id.to_string(), session);
                Ok(())
            }
            Err(e) => {
                self.errors
                    .lock()
                    .await
                    .insert(server_id.to_string(), e.clone());
                Err(e)
            }
        }
    }

    pub async fn disconnect_server(&self, server_id: &str) {
        if let Some(session) = self.sessions.lock().await.remove(server_id) {
            session.shutdown().await;
        }
        self.errors.lock().await.remove(server_id);
    }

    async fn connect_all_enabled(&self) {
        let config = self.config.lock().await.clone();
        for server in &config.servers {
            if server.enabled {
                if let Err(e) = self.connect_server(&server.id).await {
                    eprintln!("MCP: Failed to connect '{}': {}", server.name, e);
                }
            }
        }
    }

    pub async fn get_all_tools(&self) -> Vec<McpToolInfo> {
        let mut tools = Vec::new();

        // 1. Collect tools from built-in apps (if enabled)
        let config = self.config.lock().await;
        for app in apps::all_apps() {
            let enabled = config.builtin_apps.get(&app.id).copied().unwrap_or(true); // enabled by default
            if enabled {
                tools.extend(app.to_mcp_tools());
            }
        }
        drop(config);

        // 2. Collect tools from external MCP sessions
        let sessions = self.sessions.lock().await;
        for session in sessions.values() {
            let sanitized_name = sanitize_name(&session.server_name);
            for tool in &session.tools {
                let description = tool.description.as_deref().unwrap_or("").to_string();

                let input_schema = serde_json::to_value(&tool.input_schema)
                    .unwrap_or(serde_json::json!({"type": "object"}));

                tools.push(McpToolInfo {
                    namespaced_name: format!("mcp_{}_{}", sanitized_name, tool.name),
                    original_name: tool.name.to_string(),
                    server_id: session.server_id.clone(),
                    server_name: session.server_name.clone(),
                    description,
                    input_schema,
                });
            }
        }

        tools
    }

    pub async fn call_tool(
        &self,
        namespaced_name: &str,
        arguments: serde_json::Value,
        project_root: Option<&std::path::Path>,
    ) -> Result<serde_json::Value, String> {
        // 1. Check built-in apps first
        let config = self.config.lock().await;
        for app in apps::all_apps() {
            let enabled = config.builtin_apps.get(&app.id).copied().unwrap_or(true);
            if !enabled {
                continue;
            }
            let prefix = format!("mcp_{}_", app.id);
            if let Some(tool_name) = namespaced_name.strip_prefix(&prefix) {
                // Verify the tool exists
                if app.tools.iter().any(|t| t.name == tool_name) {
                    drop(config);
                    return apps::call_tool(&app.id, tool_name, arguments, project_root).await;
                }
            }
        }
        drop(config);

        // 2. Check external MCP sessions
        let sessions = self.sessions.lock().await;
        for session in sessions.values() {
            let sanitized_name = sanitize_name(&session.server_name);
            let prefix = format!("mcp_{}_", sanitized_name);
            if let Some(original_name) = namespaced_name.strip_prefix(&prefix) {
                // Verify the tool exists on this server
                if session
                    .tools
                    .iter()
                    .any(|t| t.name.as_ref() == original_name)
                {
                    return session.call_tool(original_name, arguments).await;
                }
            }
        }

        Err(format!("No MCP server found for tool: {}", namespaced_name))
    }

    pub async fn get_server_statuses(&self) -> Vec<McpServerStatus> {
        let config = self.config.lock().await;
        let sessions = self.sessions.lock().await;
        let errors = self.errors.lock().await;

        let mut statuses = Vec::new();

        // 1. Built-in apps
        for app in apps::all_apps() {
            let enabled = config.builtin_apps.get(&app.id).copied().unwrap_or(true);
            statuses.push(McpServerStatus {
                id: app.id.clone(),
                name: app.name.clone(),
                enabled,
                connected: enabled, // always "connected" when enabled
                tool_count: app.tools.len(),
                error: None,
                builtin: true,
                description: Some(app.description.clone()),
            });
        }

        // 2. External servers
        for server in &config.servers {
            let connected = sessions.contains_key(&server.id);
            let tool_count = sessions.get(&server.id).map(|s| s.tools.len()).unwrap_or(0);
            let error = errors.get(&server.id).cloned();

            statuses.push(McpServerStatus {
                id: server.id.clone(),
                name: server.name.clone(),
                enabled: server.enabled,
                connected,
                tool_count,
                error,
                builtin: false,
                description: None,
            });
        }

        statuses
    }

    // ── Built-in app management ──────────────────────────────────────

    pub async fn toggle_builtin_app(&self, app_id: &str, enabled: bool) {
        let mut config = self.config.lock().await;
        config.builtin_apps.insert(app_id.to_string(), enabled);
    }
}

fn sanitize_name(name: &str) -> String {
    name.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect()
}
