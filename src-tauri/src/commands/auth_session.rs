use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthSessionResponse {
    pub url: String,
}

#[tauri::command]
pub async fn auth_session_authenticate<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    auth_url: String,
    callback_scheme: String,
) -> Result<AuthSessionResponse, String> {
    #[cfg(mobile)]
    {
        use tauri_plugin_oauth_session::{AuthenticateOptions, OAuthSessionExt};

        let response = app
            .oauth_session()
            .authenticate(AuthenticateOptions {
                auth_url,
                callback_scheme,
                prefers_ephemeral_session: Some(false),
            })
            .await
            .map_err(|error| error.to_string())?;

        Ok(AuthSessionResponse { url: response.url })
    }

    #[cfg(not(mobile))]
    {
        let _ = app;
        let _ = auth_url;
        let _ = callback_scheme;
        Err("Native auth session is only available on mobile.".to_string())
    }
}
