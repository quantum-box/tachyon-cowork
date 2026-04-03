pub mod executor;

use microsandbox::Sandbox;

const DEFAULT_PYTHON_IMAGE: &str = "python:3.12-slim";
const DEFAULT_NODE_IMAGE: &str = "node:20-slim";
const DEFAULT_SHELL_IMAGE: &str = "alpine:latest";
const TACHYON_IMAGE: &str = "tachyon-sandbox:latest";

const DEFAULT_MEMORY_MIB: u32 = 512;
const DEFAULT_CPUS: u8 = 1;

/// Sandbox manager for creating and managing microsandbox instances
pub struct SandboxManager;

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

    /// Create a sandbox for code execution
    pub async fn create_code_sandbox(&self, name: &str, language: &str) -> Result<Sandbox, String> {
        let image = Self::image_for_language(language);
        Self::create_sandbox_with_image(name, image).await
    }

    /// Create a sandbox for file generation (uses tachyon image with pre-installed libs)
    pub async fn create_file_sandbox(name: &str) -> Result<Sandbox, String> {
        // Try tachyon image first, fall back to plain python
        match Self::create_sandbox_with_image(name, TACHYON_IMAGE).await {
            Ok(sb) => Ok(sb),
            Err(_) => Self::create_sandbox_with_image(name, DEFAULT_PYTHON_IMAGE).await,
        }
    }

    async fn create_sandbox_with_image(name: &str, image: &str) -> Result<Sandbox, String> {
        // Remove any leftover sandbox with the same name
        let _ = Sandbox::remove(name).await;

        Sandbox::builder(name)
            .image(image)
            .memory(DEFAULT_MEMORY_MIB)
            .cpus(DEFAULT_CPUS)
            .create()
            .await
            .map_err(|e| format!("Failed to create sandbox: {}", e))
    }
}

impl Default for SandboxManager {
    fn default() -> Self {
        Self::new()
    }
}
