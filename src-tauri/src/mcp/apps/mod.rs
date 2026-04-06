pub mod file_manager;
pub mod office_worker;
pub mod web_search;

use serde::Serialize;

use super::config::McpToolInfo;

/// Definition of a built-in MCP app
#[derive(Debug, Clone, Serialize)]
pub struct BuiltinAppInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub tools: Vec<BuiltinToolDef>,
}

/// Tool definition within a built-in app
#[derive(Debug, Clone, Serialize)]
pub struct BuiltinToolDef {
    pub name: String,
    pub description: String,
    pub input_schema: serde_json::Value,
}

impl BuiltinAppInfo {
    /// Convert tool defs to McpToolInfo with proper namespacing
    pub fn to_mcp_tools(&self) -> Vec<McpToolInfo> {
        self.tools
            .iter()
            .map(|t| McpToolInfo {
                namespaced_name: format!("mcp_{}_{}", self.id, t.name),
                original_name: t.name.clone(),
                server_id: self.id.clone(),
                server_name: self.name.clone(),
                description: t.description.clone(),
                input_schema: t.input_schema.clone(),
            })
            .collect()
    }
}

/// Returns all available built-in app definitions
pub fn all_apps() -> Vec<BuiltinAppInfo> {
    vec![
        file_manager::app_info(),
        office_worker::app_info(),
        web_search::app_info(),
    ]
}

/// Dispatch a tool call to the appropriate built-in app
pub async fn call_tool(
    app_id: &str,
    tool_name: &str,
    arguments: serde_json::Value,
) -> Result<serde_json::Value, String> {
    match app_id {
        "file_manager" => file_manager::call_tool(tool_name, arguments).await,
        "office_worker" => office_worker::call_tool(tool_name, arguments).await,
        "web_search" => web_search::call_tool(tool_name, arguments).await,
        _ => Err(format!("Unknown built-in app: {}", app_id)),
    }
}
