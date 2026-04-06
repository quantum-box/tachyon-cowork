use rmcp::{
    model::{CallToolRequestParams, ClientInfo, Implementation},
    service::RunningService,
    RoleClient,
};
use std::collections::HashMap;

use super::config::McpTransportConfig;

pub struct McpClientSession {
    pub server_id: String,
    pub server_name: String,
    client: RunningService<RoleClient, ClientInfo>,
    pub tools: Vec<rmcp::model::Tool>,
}

fn client_info() -> ClientInfo {
    let mut info = ClientInfo::default();
    info.client_info = Implementation::new("tachyon-cowork", "0.1.0");
    info
}

impl McpClientSession {
    pub async fn connect(
        server_id: String,
        server_name: String,
        transport: &McpTransportConfig,
    ) -> Result<Self, String> {
        match transport {
            McpTransportConfig::Stdio { command, args, env } => {
                Self::connect_stdio(server_id, server_name, command, args, env).await
            }
            McpTransportConfig::Sse { url: _, headers: _ } => {
                Err("SSE transport is not yet supported".to_string())
            }
        }
    }

    async fn connect_stdio(
        server_id: String,
        server_name: String,
        command: &str,
        args: &[String],
        env: &HashMap<String, String>,
    ) -> Result<Self, String> {
        let mut cmd = tokio::process::Command::new(command);
        cmd.args(args);
        for (k, v) in env {
            cmd.env(k, v);
        }

        let transport = rmcp::transport::TokioChildProcess::new(cmd)
            .map_err(|e| format!("Failed to spawn MCP server '{}': {}", server_name, e))?;

        let client = rmcp::serve_client(client_info(), transport)
            .await
            .map_err(|e| format!("Failed to initialize MCP server '{}': {}", server_name, e))?;

        let tools_result = client
            .peer()
            .list_tools(None)
            .await
            .map_err(|e| format!("Failed to list tools from '{}': {}", server_name, e))?;

        Ok(Self {
            server_id,
            server_name,
            client,
            tools: tools_result.tools,
        })
    }

    pub async fn call_tool(
        &self,
        name: &str,
        arguments: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        let args_map = match arguments {
            serde_json::Value::Object(map) => Some(map),
            _ => None,
        };
        let mut params = CallToolRequestParams::new(name.to_string());
        if let Some(map) = args_map {
            params = params.with_arguments(map);
        }

        let result = self
            .client
            .peer()
            .call_tool(params)
            .await
            .map_err(|e| format!("Tool call failed on '{}': {}", self.server_name, e))?;

        // Convert MCP content to JSON
        let contents: Vec<serde_json::Value> = result
            .content
            .into_iter()
            .map(|c| match c.raw {
                rmcp::model::RawContent::Text(t) => {
                    serde_json::json!({"type": "text", "text": t.text})
                }
                rmcp::model::RawContent::Image(img) => {
                    serde_json::json!({"type": "image", "data": img.data, "mime_type": img.mime_type})
                }
                rmcp::model::RawContent::Resource(res) => {
                    serde_json::json!({"type": "resource", "resource": serde_json::to_value(&res.resource).unwrap_or_default()})
                }
                _ => serde_json::json!({"type": "unknown"}),
            })
            .collect();

        if contents.len() == 1 {
            Ok(contents.into_iter().next().unwrap())
        } else {
            Ok(serde_json::Value::Array(contents))
        }
    }

    pub async fn shutdown(self) {
        let _ = self.client.cancel().await;
    }
}
