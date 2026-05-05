pub mod executor;
pub mod workspace;

#[cfg(not(any(target_os = "ios", target_os = "android")))]
use microsandbox::Sandbox;

#[cfg(not(any(target_os = "ios", target_os = "android")))]
const DEFAULT_PYTHON_IMAGE: &str = "python:3.12-slim";
#[cfg(not(any(target_os = "ios", target_os = "android")))]
const DEFAULT_NODE_IMAGE: &str = "node:20-slim";
#[cfg(not(any(target_os = "ios", target_os = "android")))]
const DEFAULT_SHELL_IMAGE: &str = "alpine:latest";
#[cfg(not(any(target_os = "ios", target_os = "android")))]
const TACHYON_IMAGE: &str = "tachyon-sandbox:latest";

#[cfg(not(any(target_os = "ios", target_os = "android")))]
const DEFAULT_MEMORY_MIB: u32 = 512;
#[cfg(not(any(target_os = "ios", target_os = "android")))]
const DEFAULT_CPUS: u8 = 1;

/// Sandbox manager for creating and managing microsandbox instances
#[cfg(not(any(target_os = "ios", target_os = "android")))]
pub struct SandboxManager;

#[cfg(not(any(target_os = "ios", target_os = "android")))]
impl SandboxManager {
    pub fn new() -> Self {
        Self
    }

    /// Get the OCI image for a given language
    pub fn image_for_language(language: &str) -> &'static str {
        match language {
            "python" => DEFAULT_PYTHON_IMAGE,
            "javascript" | "js" => DEFAULT_NODE_IMAGE,
            "shell" | "sh" | "bash" => DEFAULT_SHELL_IMAGE,
            _ => DEFAULT_SHELL_IMAGE,
        }
    }

    /// Create a sandbox for code execution with a workspace volume
    pub async fn create_code_sandbox(
        &self,
        name: &str,
        language: &str,
        workspace_host_dir: &str,
    ) -> Result<Sandbox, String> {
        let image = Self::image_for_language(language);
        Self::create_sandbox_with_volume(name, image, workspace_host_dir).await
    }

    /// Create a sandbox for file generation with a workspace volume
    pub async fn create_file_sandbox(
        name: &str,
        workspace_host_dir: &str,
    ) -> Result<Sandbox, String> {
        match Self::create_sandbox_with_volume(name, TACHYON_IMAGE, workspace_host_dir).await {
            Ok(sb) => Ok(sb),
            Err(_) => {
                Self::create_sandbox_with_volume(name, DEFAULT_PYTHON_IMAGE, workspace_host_dir)
                    .await
            }
        }
    }

    /// Create a sandbox with a bind-mounted workspace volume
    async fn create_sandbox_with_volume(
        name: &str,
        image: &str,
        workspace_host_dir: &str,
    ) -> Result<Sandbox, String> {
        // Remove any leftover sandbox with the same name
        let _ = Sandbox::remove(name).await;

        Sandbox::builder(name)
            .image(image)
            .memory(DEFAULT_MEMORY_MIB)
            .cpus(DEFAULT_CPUS)
            .volume("/workspace", |m| m.bind(workspace_host_dir))
            .workdir("/workspace")
            .create()
            .await
            .map_err(|e| format!("Failed to create sandbox: {}", e))
    }
}

#[cfg(not(any(target_os = "ios", target_os = "android")))]
impl Default for SandboxManager {
    fn default() -> Self {
        Self::new()
    }
}
