use tauri::AppHandle;

use crate::project::ProjectManager;

#[tauri::command]
pub async fn project_get_state(
    state: tauri::State<'_, ProjectManager>,
) -> Result<crate::project::ProjectState, String> {
    Ok(state.get_state().await)
}

#[tauri::command]
pub async fn project_set_active(
    state: tauri::State<'_, ProjectManager>,
    app: AppHandle,
    path: String,
) -> Result<crate::project::ProjectState, String> {
    state.set_active_project(&app, path).await
}

#[tauri::command]
pub async fn project_remove_recent(
    state: tauri::State<'_, ProjectManager>,
    app: AppHandle,
    path: String,
) -> Result<crate::project::ProjectState, String> {
    state.remove_recent_project(&app, path).await
}
