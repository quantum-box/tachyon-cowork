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

#[tauri::command]
pub async fn project_get_active_context(
    state: tauri::State<'_, ProjectManager>,
) -> Result<Option<crate::project::ProjectContext>, String> {
    state.get_active_context().await
}

#[tauri::command]
pub async fn project_initialize_active(
    state: tauri::State<'_, ProjectManager>,
    app: AppHandle,
) -> Result<crate::project::ProjectContext, String> {
    state.initialize_active_project(&app).await
}

#[tauri::command]
pub async fn project_update_active_custom_instructions(
    state: tauri::State<'_, ProjectManager>,
    app: AppHandle,
    custom_instructions: String,
) -> Result<crate::project::ProjectContext, String> {
    state
        .update_active_project_custom_instructions(&app, custom_instructions)
        .await
}
