use crate::sandbox::executor;

pub use executor::{
    ExecuteCodeRequest, ExecuteCodeResult, GenerateFileRequest, GenerateFileResult,
};

#[tauri::command]
pub async fn execute_code(request: ExecuteCodeRequest) -> Result<ExecuteCodeResult, String> {
    executor::run_code(&request).await
}

#[tauri::command]
pub async fn generate_file(request: GenerateFileRequest) -> Result<GenerateFileResult, String> {
    executor::generate_file(&request).await
}
