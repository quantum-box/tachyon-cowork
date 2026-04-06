use serde::Serialize;
use std::path::{Path, PathBuf};

/// Base directory for all sandbox workspaces
const WORKSPACE_BASE: &str = "/tmp/cowork-files";

/// Maximum age (in seconds) before a workspace is eligible for cleanup
const WORKSPACE_TTL_SECS: u64 = 24 * 60 * 60; // 24 hours

/// Metadata about a file in the workspace
#[derive(Debug, Clone, Serialize)]
pub struct WorkspaceFile {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub is_dir: bool,
}

/// Create a workspace directory for the given sandbox and return its host path.
pub fn create_workspace(sandbox_id: &str) -> Result<String, String> {
    let dir = workspace_path(sandbox_id);
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create workspace dir {}: {}", dir.display(), e))?;
    Ok(dir.to_string_lossy().to_string())
}

/// List files in a workspace directory (non-recursive, top-level only).
pub fn list_files(sandbox_id: &str) -> Result<Vec<WorkspaceFile>, String> {
    let dir = workspace_path(sandbox_id);
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut files = Vec::new();
    let entries =
        std::fs::read_dir(&dir).map_err(|e| format!("Failed to read workspace dir: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        // Skip hidden files and the data.json / generate.py temp files
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        files.push(WorkspaceFile {
            name,
            path: entry.path().to_string_lossy().to_string(),
            size: metadata.len(),
            is_dir: metadata.is_dir(),
        });
    }

    files.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(files)
}

/// Read a file from the workspace, returning its bytes.
pub fn read_file(sandbox_id: &str, filename: &str) -> Result<Vec<u8>, String> {
    let file_path = workspace_path(sandbox_id).join(filename);

    // Prevent path traversal
    let canonical = file_path
        .canonicalize()
        .map_err(|e| format!("File not found: {}", e))?;
    let base = workspace_path(sandbox_id)
        .canonicalize()
        .map_err(|e| format!("Workspace not found: {}", e))?;
    if !canonical.starts_with(&base) {
        return Err("Access denied: path traversal detected".to_string());
    }

    std::fs::read(&canonical).map_err(|e| format!("Failed to read file: {}", e))
}

/// Remove a single workspace directory.
pub fn cleanup(sandbox_id: &str) -> Result<(), String> {
    let dir = workspace_path(sandbox_id);
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| format!("Failed to cleanup workspace: {}", e))?;
    }
    Ok(())
}

/// Remove all workspace directories older than TTL.
pub fn cleanup_stale() -> Result<u32, String> {
    let base = Path::new(WORKSPACE_BASE);
    if !base.exists() {
        return Ok(0);
    }

    let now = std::time::SystemTime::now();
    let mut removed = 0u32;

    let entries = std::fs::read_dir(base).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        if !metadata.is_dir() {
            continue;
        }
        let modified = metadata.modified().unwrap_or(now);
        if let Ok(age) = now.duration_since(modified) {
            if age.as_secs() > WORKSPACE_TTL_SECS {
                if std::fs::remove_dir_all(entry.path()).is_ok() {
                    removed += 1;
                }
            }
        }
    }

    Ok(removed)
}

fn workspace_path(sandbox_id: &str) -> PathBuf {
    Path::new(WORKSPACE_BASE).join(sandbox_id)
}
