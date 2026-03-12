use base64::Engine;
use serde::{Deserialize, Serialize};

use crate::commands;

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
pub async fn execute_tool(tool_call: ToolCall) -> Result<ToolResult, String> {
    let tool_id = format!("tool_{}", uuid_simple());

    match tool_call.name.as_str() {
        "excel_read" => {
            let path = tool_call
                .arguments
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or("Missing 'path' argument")?
                .to_string();
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
                serde_json::from_value(tool_call.arguments.clone())
                    .map_err(|e| e.to_string())?;
            match commands::excel::write_excel(data).await {
                Ok(bytes) => {
                    let b64 =
                        base64::engine::general_purpose::STANDARD.encode(&bytes);
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
