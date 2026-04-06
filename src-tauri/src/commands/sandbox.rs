use crate::sandbox::executor;
use crate::sandbox::workspace;

pub use executor::{
    ExecuteCodeRequest, ExecuteCodeResult, GenerateFileRequest, GenerateFileResult,
};
pub use workspace::WorkspaceFile;

#[tauri::command]
pub async fn execute_code(request: ExecuteCodeRequest) -> Result<ExecuteCodeResult, String> {
    executor::run_code(&request).await
}

#[tauri::command]
pub async fn generate_file(request: GenerateFileRequest) -> Result<GenerateFileResult, String> {
    executor::generate_file(&request).await
}

/// List files in a sandbox workspace directory
#[tauri::command]
pub async fn list_workspace_files(workspace_id: String) -> Result<Vec<WorkspaceFile>, String> {
    workspace::list_files(&workspace_id)
}

/// Read a file from a sandbox workspace (returns base64-encoded bytes)
#[tauri::command]
pub async fn read_workspace_file(
    workspace_id: String,
    filename: String,
) -> Result<Vec<u8>, String> {
    workspace::read_file(&workspace_id, &filename)
}

/// Clean up a specific workspace
#[tauri::command]
pub async fn cleanup_workspace(workspace_id: String) -> Result<(), String> {
    workspace::cleanup(&workspace_id)
}

/// Clean up all stale workspaces (older than 24h)
#[tauri::command]
pub async fn cleanup_stale_workspaces() -> Result<u32, String> {
    workspace::cleanup_stale()
}
