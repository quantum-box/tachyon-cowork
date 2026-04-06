use rmcp::{
    model::{CallToolRequestParam, ClientInfo, Implementation},
    service::RunningService,
    transport::streamable_http_client::StreamableHttpClientTransport,
    RoleClient,
};
use std::collections::HashMap;

use super::config::McpTransportConfig;

pub struct McpClientSession {
    pub server_id: String,
    pub server_name: String,
    client: RunningService<RoleClient>,
    pub tools: Vec<rmcp::model::Tool>,
}

fn client_info() -> ClientInfo {
    ClientInfo {
        protocol_version: Default::default(),
        capabilities: Default::default(),
        client_info: Implementation {
            name: "tachyon-cowork".into(),
            version: "0.1.0".into(),
        },
    }
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
            McpTransportConfig::Sse { url, headers: _ } => {
                Self::connect_sse(server_id, server_name, url).await
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

        let transport = rmcp::transport::TokioChildProcess::new(&mut cmd)
            .map_err(|e| format!("Failed to spawn MCP server '{}': {}", server_name, e))?;

        let client = rmcp::serve_client(client_info(), transport)
            .await
            .map_err(|e| format!("Failed to initialize MCP server '{}': {}", server_name, e))?;

        let tools_result = client
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

    async fn connect_sse(
        server_id: String,
        server_name: String,
        url: &str,
    ) -> Result<Self, String> {
        let transport = StreamableHttpClientTransport::builder(
            url.parse()
                .map_err(|e| format!("Invalid URL for '{}': {}", server_name, e))?,
        )
        .build();

        let client = rmcp::serve_client(client_info(), transport)
            .await
            .map_err(|e| format!("Failed to initialize MCP server '{}': {}", server_name, e))?;

        let tools_result = client
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
        let params = CallToolRequestParam {
            name: name.into(),
            arguments: match arguments {
                serde_json::Value::Object(map) => Some(map),
                _ => None,
            },
        };

        let result = self
            .client
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
                    serde_json::json!({"type": "resource", "uri": res.resource.uri, "text": res.resource.text})
                }
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
