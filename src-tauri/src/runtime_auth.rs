use std::sync::OnceLock;

use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeAuth {
    pub api_base_url: String,
    pub access_token: String,
    pub tenant_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
}

static RUNTIME_AUTH: OnceLock<RwLock<Option<RuntimeAuth>>> = OnceLock::new();

fn store() -> &'static RwLock<Option<RuntimeAuth>> {
    RUNTIME_AUTH.get_or_init(|| RwLock::new(None))
}

pub async fn set_runtime_auth(auth: RuntimeAuth) {
    *store().write().await = Some(auth);
}

pub async fn clear_runtime_auth() {
    *store().write().await = None;
}

pub async fn get_runtime_auth() -> Option<RuntimeAuth> {
    store().read().await.clone()
}
