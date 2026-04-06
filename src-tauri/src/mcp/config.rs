use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum McpTransportConfig {
    #[serde(rename = "stdio")]
    Stdio {
        command: String,
        #[serde(default)]
        args: Vec<String>,
        #[serde(default)]
        env: HashMap<String, String>,
    },
    #[serde(rename = "sse")]
    Sse {
        url: String,
        #[serde(default)]
        headers: HashMap<String, String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub transport: McpTransportConfig,
    #[serde(default)]
    pub builtin: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct McpConfig {
    #[serde(default)]
    pub servers: Vec<McpServerConfig>,
    /// Built-in app enable/disable state (app_id -> enabled).
    /// Apps not listed are enabled by default.
    #[serde(default)]
    pub builtin_apps: HashMap<String, bool>,
}

#[derive(Debug, Clone, Serialize)]
pub struct McpToolInfo {
    pub namespaced_name: String,
    pub original_name: String,
    pub server_id: String,
    pub server_name: String,
    pub description: String,
    pub input_schema: serde_json::Value,
}

#[derive(Debug, Clone, Serialize)]
pub struct McpServerStatus {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub connected: bool,
    pub tool_count: usize,
    pub error: Option<String>,
    pub builtin: bool,
    /// Description (for built-in apps)
    pub description: Option<String>,
}
