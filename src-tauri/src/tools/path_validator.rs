use std::path::{Path, PathBuf};

/// Returns the user's home directory.
fn home_dir() -> Result<PathBuf, String> {
    dirs::home_dir().ok_or_else(|| "Cannot determine home directory".to_string())
}

/// Validate and canonicalize a path, ensuring it is within the user's home directory.
///
/// Security measures:
/// 1. Resolve to absolute path
/// 2. Canonicalize to eliminate `..`, `.`, and symlinks
/// 3. Verify the resolved path is under `$HOME`
pub fn validate_path(raw: &str) -> Result<PathBuf, String> {
    let raw = raw.trim();
    if raw.is_empty() {
        return Err("Path must not be empty".to_string());
    }

    let path = Path::new(raw);

    // Must be absolute
    if !path.is_absolute() {
        return Err(format!(
            "Path must be absolute (got relative path: {})",
            raw
        ));
    }

    let home = home_dir()?;

    // For existing paths, canonicalize resolves symlinks and `..`
    // For non-existing paths (e.g. write target), we canonicalize the parent
    let canonical = if path.exists() {
        path.canonicalize()
            .map_err(|e| format!("Failed to resolve path '{}': {}", raw, e))?
    } else {
        // Parent must exist for write operations
        let parent = path
            .parent()
            .ok_or_else(|| format!("Invalid path (no parent): {}", raw))?;
        if !parent.exists() {
            return Err(format!(
                "Parent directory does not exist: {}",
                parent.display()
            ));
        }
        let canonical_parent = parent
            .canonicalize()
            .map_err(|e| format!("Failed to resolve parent of '{}': {}", raw, e))?;
        let file_name = path
            .file_name()
            .ok_or_else(|| format!("Invalid path (no filename): {}", raw))?;
        canonical_parent.join(file_name)
    };

    // Check the canonical path starts with home directory
    if !canonical.starts_with(&home) {
        return Err(format!(
            "Access denied: path '{}' is outside the home directory",
            raw
        ));
    }

    Ok(canonical)
}

/// Validate a path for read operations (file/dir must exist).
pub fn validate_read_path(raw: &str) -> Result<PathBuf, String> {
    let path = validate_path(raw)?;
    if !path.exists() {
        return Err(format!("File or directory not found: {}", raw));
    }
    Ok(path)
}

/// Resolve a project-scoped path.
///
/// Relative paths are resolved from the project root.
/// Absolute paths must stay within the project root after canonicalization.
pub fn resolve_project_path(
    project_root: &Path,
    raw: &str,
    require_exists: bool,
) -> Result<PathBuf, String> {
    let raw = raw.trim();
    if raw.is_empty() {
        return Err("Path must not be empty".to_string());
    }

    let candidate = if Path::new(raw).is_absolute() {
        PathBuf::from(raw)
    } else {
        project_root.join(raw)
    };

    let canonical = if candidate.exists() {
        candidate
            .canonicalize()
            .map_err(|e| format!("Failed to resolve path '{}': {}", raw, e))?
    } else {
        let parent = candidate
            .parent()
            .ok_or_else(|| format!("Invalid path (no parent): {}", raw))?;
        if !parent.exists() {
            return Err(format!(
                "Parent directory does not exist: {}",
                parent.display()
            ));
        }
        let canonical_parent = parent
            .canonicalize()
            .map_err(|e| format!("Failed to resolve parent of '{}': {}", raw, e))?;
        let file_name = candidate
            .file_name()
            .ok_or_else(|| format!("Invalid path (no filename): {}", raw))?;
        canonical_parent.join(file_name)
    };

    let canonical_project = project_root.canonicalize().map_err(|e| {
        format!(
            "Failed to resolve project root '{}': {}",
            project_root.display(),
            e
        )
    })?;

    if !canonical.starts_with(&canonical_project) {
        return Err(format!(
            "Access denied: path '{}' is outside the active project directory",
            raw
        ));
    }

    if require_exists && !canonical.exists() {
        return Err(format!("File or directory not found: {}", raw));
    }

    Ok(canonical)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rejects_relative_path() {
        assert!(validate_path("relative/path").is_err());
        assert!(validate_path("./foo").is_err());
    }

    #[test]
    fn test_rejects_empty() {
        assert!(validate_path("").is_err());
        assert!(validate_path("  ").is_err());
    }

    #[test]
    fn test_rejects_outside_home() {
        assert!(validate_path("/etc/passwd").is_err());
        assert!(validate_path("/tmp/test").is_err());
    }

    #[test]
    fn test_accepts_home_dir() {
        let home = home_dir().unwrap();
        let result = validate_path(home.to_str().unwrap());
        assert!(result.is_ok());
    }

    #[test]
    fn test_rejects_traversal() {
        let home = home_dir().unwrap();
        let traversal = format!("{}/../../../etc/passwd", home.display());
        assert!(validate_path(&traversal).is_err());
    }
}
