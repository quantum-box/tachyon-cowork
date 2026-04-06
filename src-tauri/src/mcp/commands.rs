use tauri::AppHandle;

use super::{
    apps,
    config::{McpConfig, McpServerConfig, McpServerStatus, McpToolInfo},
    manager::McpManager,
};
use crate::project::ProjectManager;
use crate::tools::executor::ToolResult;

#[tauri::command]
pub async fn mcp_get_config(state: tauri::State<'_, McpManager>) -> Result<McpConfig, String> {
    Ok(state.get_config().await)
}

#[tauri::command]
pub async fn mcp_add_server(
    state: tauri::State<'_, McpManager>,
    app: AppHandle,
    server: McpServerConfig,
) -> Result<McpConfig, String> {
    {
        let mut config = state.get_config().await;
        config.servers.push(server.clone());
        state.set_config(config).await;
        state.save_config(&app).await?;
    }

    if server.enabled {
        // Best-effort connect; don't fail the add operation
        let _ = state.connect_server(&server.id).await;
    }

    Ok(state.get_config().await)
}

#[tauri::command]
pub async fn mcp_remove_server(
    state: tauri::State<'_, McpManager>,
    app: AppHandle,
    server_id: String,
) -> Result<McpConfig, String> {
    state.disconnect_server(&server_id).await;

    let mut config = state.get_config().await;
    config.servers.retain(|s| s.id != server_id);
    state.set_config(config).await;
    state.save_config(&app).await?;

    Ok(state.get_config().await)
}

#[tauri::command]
pub async fn mcp_toggle_server(
    state: tauri::State<'_, McpManager>,
    app: AppHandle,
    server_id: String,
    enabled: bool,
) -> Result<(), String> {
    {
        let mut config = state.get_config().await;
        if let Some(server) = config.servers.iter_mut().find(|s| s.id == server_id) {
            server.enabled = enabled;
        }
        state.set_config(config).await;
        state.save_config(&app).await?;
    }

    if enabled {
        let _ = state.connect_server(&server_id).await;
    } else {
        state.disconnect_server(&server_id).await;
    }

    Ok(())
}

#[tauri::command]
pub async fn mcp_get_tools(
    state: tauri::State<'_, McpManager>,
) -> Result<Vec<McpToolInfo>, String> {
    Ok(state.get_all_tools().await)
}

#[tauri::command]
pub async fn mcp_call_tool(
    state: tauri::State<'_, McpManager>,
    project_manager: tauri::State<'_, ProjectManager>,
    namespaced_name: String,
    arguments: serde_json::Value,
) -> Result<ToolResult, String> {
    let project_root = project_manager.active_project_root().await;
    match state
        .call_tool(&namespaced_name, arguments, project_root.as_deref())
        .await
    {
        Ok(result) => Ok(ToolResult {
            tool_id: format!("mcp_{}", uuid::Uuid::new_v4()),
            result,
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            tool_id: format!("mcp_{}", uuid::Uuid::new_v4()),
            result: serde_json::Value::Null,
            error: Some(e),
        }),
    }
}

#[tauri::command]
pub async fn mcp_get_server_statuses(
    state: tauri::State<'_, McpManager>,
) -> Result<Vec<McpServerStatus>, String> {
    Ok(state.get_server_statuses().await)
}

#[tauri::command]
pub async fn mcp_toggle_builtin_app(
    state: tauri::State<'_, McpManager>,
    app_handle: AppHandle,
    app_id: String,
    enabled: bool,
) -> Result<(), String> {
    // Verify the app exists
    if !apps::all_apps().iter().any(|a| a.id == app_id) {
        return Err(format!("Unknown built-in app: {}", app_id));
    }
    state.toggle_builtin_app(&app_id, enabled).await;
    state.save_config(&app_handle).await?;
    Ok(())
}

#[tauri::command]
pub async fn mcp_get_builtin_apps() -> Result<Vec<apps::BuiltinAppInfo>, String> {
    Ok(apps::all_apps())
}
