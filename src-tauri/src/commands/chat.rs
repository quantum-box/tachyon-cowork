use serde::{Deserialize, Serialize};

use crate::runtime_auth::{self, RuntimeAuth};

#[derive(Debug, Serialize, Deserialize)]
pub struct AppConfig {
    pub api_base_url: String,
    pub tenant_slug: String,
}

/// Returns the app configuration (API endpoint, tenant info)
#[tauri::command]
pub async fn get_config() -> Result<AppConfig, String> {
    Ok(AppConfig {
        api_base_url: std::env::var("TACHYON_API_URL")
            .unwrap_or_else(|_| "https://api.n1.tachy.one".to_string()),
        tenant_slug: std::env::var("TACHYON_TENANT_SLUG").unwrap_or_else(|_| "default".to_string()),
    })
}

/// Placeholder for sending messages via Rust backend (for future Tauri-specific features)
#[tauri::command]
pub async fn send_message(message: String) -> Result<String, String> {
    // For now, the frontend handles SSE streaming directly.
    // This command will be used later for client-side tool execution.
    Ok(format!("Received: {}", message))
}

#[tauri::command]
pub async fn chat_set_runtime_auth(auth: RuntimeAuth) -> Result<(), String> {
    runtime_auth::set_runtime_auth(auth).await;
    Ok(())
}

#[tauri::command]
pub async fn chat_clear_runtime_auth() -> Result<(), String> {
    runtime_auth::clear_runtime_auth().await;
    Ok(())
}
