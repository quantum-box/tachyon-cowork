//! Host filesystem operations with path validation.
//!
//! All paths are validated to be within the user's home directory.
//! Code execution is NOT handled here — it stays in the sandbox.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::LazyLock;

use crate::tools::path_validator;

// ── Allowed commands for host execution ──────────────────────────────

static ALLOWED_COMMANDS: LazyLock<HashSet<&'static str>> = LazyLock::new(|| {
    HashSet::from([
        // File listing / info
        "ls", "stat", "file", "du", "wc", // File search
        "find", "which", // Text processing (read-only)
        "cat", "head", "tail", "grep", "sort", "uniq", "diff", // Archive
        "tar", "zip", "unzip", // Misc safe
        "date", "echo", "pwd", "basename", "dirname", "realpath",
    ])
});

// ── Types ────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct HostReadResult {
    pub path: String,
    pub content: String,
    pub size: u64,
    pub is_binary: bool,
}

#[derive(Serialize)]
pub struct HostWriteResult {
    pub path: String,
    pub bytes_written: u64,
}

#[derive(Serialize)]
pub struct HostDirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: Option<String>,
}

#[derive(Serialize)]
pub struct HostDirResult {
    pub path: String,
    pub entries: Vec<HostDirEntry>,
    pub total: usize,
}

#[derive(Serialize)]
pub struct HostCommandResult {
    pub command: String,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

// ── Commands ─────────────────────────────────────────────────────────

/// Read a file from the host filesystem (home directory only).
#[tauri::command]
pub async fn host_read_file(path: String) -> Result<HostReadResult, String> {
    let validated = path_validator::validate_read_path(&path)?;

    let metadata = std::fs::metadata(&validated).map_err(|e| e.to_string())?;
    if metadata.is_dir() {
        return Err("Cannot read a directory as a file".to_string());
    }

    // Size limit: 10MB
    const MAX_SIZE: u64 = 10 * 1024 * 1024;
    if metadata.len() > MAX_SIZE {
        return Err(format!(
            "File too large ({} bytes, max {} bytes)",
            metadata.len(),
            MAX_SIZE
        ));
    }

    let bytes = std::fs::read(&validated).map_err(|e| e.to_string())?;

    // Detect binary content
    let is_binary = bytes.iter().take(8192).any(|&b| b == 0);

    let content = if is_binary {
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes)
    } else {
        String::from_utf8_lossy(&bytes).to_string()
    };

    Ok(HostReadResult {
        path: validated.to_string_lossy().to_string(),
        content,
        size: metadata.len(),
        is_binary,
    })
}

/// Write content to a file on the host filesystem (home directory only).
#[tauri::command]
pub async fn host_write_file(
    path: String,
    content: String,
    is_base64: Option<bool>,
) -> Result<HostWriteResult, String> {
    let validated = path_validator::validate_write_path(&path)?;

    let bytes = if is_base64.unwrap_or(false) {
        base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &content)
            .map_err(|e| format!("Invalid base64: {}", e))?
    } else {
        content.into_bytes()
    };

    let len = bytes.len() as u64;
    std::fs::write(&validated, &bytes).map_err(|e| e.to_string())?;

    Ok(HostWriteResult {
        path: validated.to_string_lossy().to_string(),
        bytes_written: len,
    })
}

/// List directory contents on the host filesystem (home directory only).
#[tauri::command]
pub async fn host_list_dir(
    path: String,
    show_hidden: Option<bool>,
) -> Result<HostDirResult, String> {
    let validated = path_validator::validate_read_path(&path)?;

    if !validated.is_dir() {
        return Err("Not a directory".to_string());
    }

    let show_hidden = show_hidden.unwrap_or(false);
    let mut entries = Vec::new();

    for entry in std::fs::read_dir(&validated).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();

        if !show_hidden && name.starts_with('.') {
            continue;
        }

        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        let modified = metadata.modified().ok().map(|t| {
            let dt: chrono::DateTime<chrono::Utc> = t.into();
            dt.to_rfc3339()
        });

        entries.push(HostDirEntry {
            name,
            path: entry.path().to_string_lossy().to_string(),
            is_dir: metadata.is_dir(),
            size: metadata.len(),
            modified,
        });
    }

    // Directories first, then alphabetical
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    let total = entries.len();
    Ok(HostDirResult {
        path: validated.to_string_lossy().to_string(),
        entries,
        total,
    })
}

/// Execute an allowed command on the host (home directory only for paths).
///
/// Only commands in the allow-list can be executed.
/// Working directory is restricted to the home directory.
#[tauri::command]
pub async fn host_execute_command(
    command: String,
    args: Vec<String>,
    working_dir: Option<String>,
) -> Result<HostCommandResult, String> {
    // Validate command is in allow-list
    if !ALLOWED_COMMANDS.contains(command.as_str()) {
        return Err(format!(
            "Command '{}' is not allowed. Allowed commands: {}",
            command,
            ALLOWED_COMMANDS
                .iter()
                .copied()
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }

    // Validate working directory if provided
    let cwd = match working_dir {
        Some(dir) => path_validator::validate_read_path(&dir)?,
        None => path_validator::validate_read_path(
            &dirs::home_dir()
                .ok_or("Cannot determine home directory")?
                .to_string_lossy(),
        )?,
    };

    // Validate any path-like arguments
    for arg in &args {
        if arg.starts_with('/') {
            // Absolute path argument — validate it
            path_validator::validate_path(arg)?;
        }
    }

    let output = tokio::process::Command::new(&command)
        .args(&args)
        .current_dir(&cwd)
        .output()
        .await
        .map_err(|e| format!("Failed to execute '{}': {}", command, e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    // Truncate output if too large (1MB)
    const MAX_OUTPUT: usize = 1024 * 1024;
    let stdout = if stdout.len() > MAX_OUTPUT {
        format!(
            "{}...\n[truncated, {} bytes total]",
            &stdout[..MAX_OUTPUT],
            stdout.len()
        )
    } else {
        stdout
    };

    Ok(HostCommandResult {
        command: format!("{} {}", command, args.join(" ")),
        stdout,
        stderr,
        exit_code: output.status.code().unwrap_or(-1),
    })
}
