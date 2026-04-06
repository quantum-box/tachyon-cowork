use base64::Engine;
use serde::{Deserialize, Serialize};

use crate::commands;
use crate::project::ProjectManager;
use crate::tools::path_validator;

#[derive(Deserialize)]
pub struct ToolCall {
    pub name: String,
    pub arguments: serde_json::Value,
}

#[derive(Serialize)]
pub struct ToolResult {
    pub tool_id: String,
    pub result: serde_json::Value,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn execute_tool(
    tool_call: ToolCall,
    mcp_manager: tauri::State<'_, crate::mcp::manager::McpManager>,
    project_manager: tauri::State<'_, ProjectManager>,
) -> Result<ToolResult, String> {
    let tool_id = format!("tool_{}", uuid_simple());
    let project_root = project_manager.active_project_root().await;

    match tool_call.name.as_str() {
        "excel_read" => {
            let path = tool_call
                .arguments
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or("Missing 'path' argument")?
                .to_string();
            path_validator::validate_read_path(&path)?;
            match commands::excel::read_excel(path).await {
                Ok(data) => Ok(ToolResult {
                    tool_id,
                    result: serde_json::to_value(data).unwrap_or_default(),
                    error: None,
                }),
                Err(e) => Ok(ToolResult {
                    tool_id,
                    result: serde_json::Value::Null,
                    error: Some(e),
                }),
            }
        }
        "excel_write" => {
            let data: commands::excel::WriteExcelRequest =
                serde_json::from_value(tool_call.arguments.clone()).map_err(|e| e.to_string())?;
            match commands::excel::write_excel(data).await {
                Ok(bytes) => {
                    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
                    Ok(ToolResult {
                        tool_id,
                        result: serde_json::json!({"base64": b64, "size": bytes.len()}),
                        error: None,
                    })
                }
                Err(e) => Ok(ToolResult {
                    tool_id,
                    result: serde_json::Value::Null,
                    error: Some(e),
                }),
            }
        }
        "local_list_directory" => {
            let path = tool_call
                .arguments
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or("Missing 'path' argument")?
                .to_string();
            let project_root = project_root.as_ref().ok_or("No active project selected")?;
            let path = path_validator::resolve_project_path(project_root, &path, true)?
                .to_string_lossy()
                .to_string();
            match commands::file_manage::list_directory_impl(path).await {
                Ok(entries) => Ok(ToolResult {
                    tool_id,
                    result: serde_json::to_value(entries).unwrap_or_default(),
                    error: None,
                }),
                Err(e) => Ok(ToolResult {
                    tool_id,
                    result: serde_json::Value::Null,
                    error: Some(e),
                }),
            }
        }
        "local_search_files" => {
            let directory = tool_call
                .arguments
                .get("directory")
                .and_then(|v| v.as_str())
                .ok_or("Missing 'directory' argument")?
                .to_string();
            let project_root = project_root.as_ref().ok_or("No active project selected")?;
            let directory = path_validator::resolve_project_path(project_root, &directory, true)?
                .to_string_lossy()
                .to_string();
            let pattern = tool_call
                .arguments
                .get("pattern")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let extensions = tool_call.arguments.get("extensions").and_then(|v| {
                v.as_array().map(|items| {
                    items
                        .iter()
                        .filter_map(|item| item.as_str().map(|s| s.to_string()))
                        .collect::<Vec<_>>()
                })
            });
            let max_results = tool_call
                .arguments
                .get("max_results")
                .and_then(|v| v.as_u64())
                .map(|n| n as usize);
            let recursive = tool_call
                .arguments
                .get("recursive")
                .and_then(|v| v.as_bool());
            let include_hidden = tool_call
                .arguments
                .get("include_hidden")
                .and_then(|v| v.as_bool());
            match commands::file_manage::search_files_impl(
                directory,
                pattern,
                extensions,
                max_results,
                recursive,
                include_hidden,
            )
            .await
            {
                Ok(entries) => Ok(ToolResult {
                    tool_id,
                    result: serde_json::to_value(entries).unwrap_or_default(),
                    error: None,
                }),
                Err(e) => Ok(ToolResult {
                    tool_id,
                    result: serde_json::Value::Null,
                    error: Some(e),
                }),
            }
        }
        "local_get_file_info" => {
            let path = tool_call
                .arguments
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or("Missing 'path' argument")?
                .to_string();
            let project_root = project_root.as_ref().ok_or("No active project selected")?;
            let path = path_validator::resolve_project_path(project_root, &path, true)?
                .to_string_lossy()
                .to_string();
            match commands::file_manage::get_file_info_impl(path).await {
                Ok(info) => Ok(ToolResult {
                    tool_id,
                    result: serde_json::to_value(info).unwrap_or_default(),
                    error: None,
                }),
                Err(e) => Ok(ToolResult {
                    tool_id,
                    result: serde_json::Value::Null,
                    error: Some(e),
                }),
            }
        }
        // ── Host filesystem tools (validated, home-dir restricted) ────
        "host_read_file" => {
            let path = tool_call
                .arguments
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or("Missing 'path' argument")?
                .to_string();
            match commands::host_fs::host_read_file(project_manager.clone(), path).await {
                Ok(data) => Ok(ToolResult {
                    tool_id,
                    result: serde_json::to_value(data).unwrap_or_default(),
                    error: None,
                }),
                Err(e) => Ok(ToolResult {
                    tool_id,
                    result: serde_json::Value::Null,
                    error: Some(e),
                }),
            }
        }
        "host_write_file" => {
            let path = tool_call
                .arguments
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or("Missing 'path' argument")?
                .to_string();
            let content = tool_call
                .arguments
                .get("content")
                .and_then(|v| v.as_str())
                .ok_or("Missing 'content' argument")?
                .to_string();
            let is_base64 = tool_call
                .arguments
                .get("is_base64")
                .and_then(|v| v.as_bool());
            match commands::host_fs::host_write_file(
                project_manager.clone(),
                path,
                content,
                is_base64,
            )
            .await
            {
                Ok(data) => Ok(ToolResult {
                    tool_id,
                    result: serde_json::to_value(data).unwrap_or_default(),
                    error: None,
                }),
                Err(e) => Ok(ToolResult {
                    tool_id,
                    result: serde_json::Value::Null,
                    error: Some(e),
                }),
            }
        }
        "host_list_dir" => {
            let path = tool_call
                .arguments
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or("Missing 'path' argument")?
                .to_string();
            let show_hidden = tool_call
                .arguments
                .get("show_hidden")
                .and_then(|v| v.as_bool());
            match commands::host_fs::host_list_dir(project_manager.clone(), path, show_hidden).await
            {
                Ok(data) => Ok(ToolResult {
                    tool_id,
                    result: serde_json::to_value(data).unwrap_or_default(),
                    error: None,
                }),
                Err(e) => Ok(ToolResult {
                    tool_id,
                    result: serde_json::Value::Null,
                    error: Some(e),
                }),
            }
        }
        "host_execute_command" => {
            let command = tool_call
                .arguments
                .get("command")
                .and_then(|v| v.as_str())
                .ok_or("Missing 'command' argument")?
                .to_string();
            let args = tool_call
                .arguments
                .get("args")
                .and_then(|v| v.as_array())
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|item| item.as_str().map(|s| s.to_string()))
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            let working_dir = tool_call
                .arguments
                .get("working_dir")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            match commands::host_fs::host_execute_command(
                project_manager.clone(),
                command,
                args,
                working_dir,
            )
            .await
            {
                Ok(data) => Ok(ToolResult {
                    tool_id,
                    result: serde_json::to_value(data).unwrap_or_default(),
                    error: None,
                }),
                Err(e) => Ok(ToolResult {
                    tool_id,
                    result: serde_json::Value::Null,
                    error: Some(e),
                }),
            }
        }
        "pdf_read" => {
            let path = tool_call
                .arguments
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or("Missing 'path' argument")?
                .to_string();
            let project_root = project_root.as_ref().ok_or("No active project selected")?;
            let path = path_validator::resolve_project_path(project_root, &path, true)?
                .to_string_lossy()
                .to_string();
            match commands::pdf::read_pdf_impl(path).await {
                Ok(data) => Ok(ToolResult {
                    tool_id,
                    result: serde_json::to_value(data).unwrap_or_default(),
                    error: None,
                }),
                Err(e) => Ok(ToolResult {
                    tool_id,
                    result: serde_json::Value::Null,
                    error: Some(e),
                }),
            }
        }
        "docx_read" => {
            let path = tool_call
                .arguments
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or("Missing 'path' argument")?
                .to_string();
            let project_root = project_root.as_ref().ok_or("No active project selected")?;
            let path = path_validator::resolve_project_path(project_root, &path, true)?
                .to_string_lossy()
                .to_string();
            match commands::docx::read_docx_impl(path).await {
                Ok(data) => Ok(ToolResult {
                    tool_id,
                    result: serde_json::to_value(data).unwrap_or_default(),
                    error: None,
                }),
                Err(e) => Ok(ToolResult {
                    tool_id,
                    result: serde_json::Value::Null,
                    error: Some(e),
                }),
            }
        }
        "execute_code" => {
            let request: crate::sandbox::executor::ExecuteCodeRequest =
                serde_json::from_value(tool_call.arguments.clone()).map_err(|e| e.to_string())?;
            match crate::sandbox::executor::run_code(&request).await {
                Ok(result) => Ok(ToolResult {
                    tool_id,
                    result: serde_json::json!({
                        "stdout": result.stdout,
                        "stderr": result.stderr,
                        "exit_code": result.exit_code,
                        "timed_out": result.timed_out,
                        "duration_ms": result.duration_ms,
                        "workspace_id": result.workspace_id,
                        "workspace_files": result.workspace_files,
                    }),
                    error: None,
                }),
                Err(e) => Ok(ToolResult {
                    tool_id,
                    result: serde_json::Value::Null,
                    error: Some(e),
                }),
            }
        }
        "generate_file" => {
            let request: crate::sandbox::executor::GenerateFileRequest =
                serde_json::from_value(tool_call.arguments.clone()).map_err(|e| e.to_string())?;
            match crate::sandbox::executor::generate_file(&request).await {
                Ok(result) => {
                    let b64 = base64::engine::general_purpose::STANDARD.encode(&result.file_bytes);
                    Ok(ToolResult {
                        tool_id,
                        result: serde_json::json!({
                            "base64": b64,
                            "file_name": result.file_name,
                            "size": result.file_bytes.len(),
                            "saved_path": result.saved_path,
                            "workspace_id": result.workspace_id,
                            "workspace_files": result.workspace_files,
                        }),
                        error: None,
                    })
                }
                Err(e) => Ok(ToolResult {
                    tool_id,
                    result: serde_json::Value::Null,
                    error: Some(e),
                }),
            }
        }
        _ if tool_call.name.starts_with("mcp_") => {
            match mcp_manager
                .call_tool(
                    &tool_call.name,
                    tool_call.arguments,
                    project_root.as_deref(),
                )
                .await
            {
                Ok(result) => Ok(ToolResult {
                    tool_id,
                    result,
                    error: None,
                }),
                Err(e) => Ok(ToolResult {
                    tool_id,
                    result: serde_json::Value::Null,
                    error: Some(e),
                }),
            }
        }
        _ => Err(format!("Unknown tool: {}", tool_call.name)),
    }
}

fn uuid_simple() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!("{:x}{:x}", ts.as_secs(), ts.subsec_nanos())
}
