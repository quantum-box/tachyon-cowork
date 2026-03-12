use serde::{Deserialize, Serialize};
use std::fs;
use walkdir::WalkDir;

#[derive(Serialize, Clone)]
pub struct FileInfo {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub is_dir: bool,
    pub mime_type: Option<String>,
    pub modified: Option<String>,
    pub created: Option<String>,
    pub extension: Option<String>,
}

fn file_info_from_path(path: &std::path::Path) -> Option<FileInfo> {
    let metadata = fs::metadata(path).ok()?;
    let name = path.file_name()?.to_string_lossy().to_string();
    let ext = path.extension().map(|e| e.to_string_lossy().to_string());
    let mime = ext.as_ref().and_then(|e| {
        mime_guess::from_ext(e).first().map(|m| m.to_string())
    });
    let modified = metadata.modified().ok().map(|t| {
        let dt: chrono::DateTime<chrono::Utc> = t.into();
        dt.to_rfc3339()
    });
    let created = metadata.created().ok().map(|t| {
        let dt: chrono::DateTime<chrono::Utc> = t.into();
        dt.to_rfc3339()
    });
    Some(FileInfo {
        path: path.to_string_lossy().to_string(),
        name,
        size: metadata.len(),
        is_dir: metadata.is_dir(),
        mime_type: mime,
        modified,
        created,
        extension: ext,
    })
}

#[tauri::command]
pub async fn search_files(
    directory: String,
    pattern: Option<String>,
    extensions: Option<Vec<String>>,
    max_results: Option<usize>,
) -> Result<Vec<FileInfo>, String> {
    let max = max_results.unwrap_or(200);
    let mut results = Vec::new();

    for entry in WalkDir::new(&directory)
        .max_depth(10)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if results.len() >= max {
            break;
        }
        let path = entry.path();
        if path.is_dir() {
            continue;
        }

        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        if let Some(ref pat) = pattern {
            if !name.to_lowercase().contains(&pat.to_lowercase()) {
                continue;
            }
        }
        if let Some(ref exts) = extensions {
            let ext = path
                .extension()
                .map(|e| e.to_string_lossy().to_lowercase())
                .unwrap_or_default();
            if !exts.iter().any(|e| e.to_lowercase() == ext) {
                continue;
            }
        }

        if let Some(info) = file_info_from_path(path) {
            results.push(info);
        }
    }

    results.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(results)
}

#[tauri::command]
pub async fn list_directory(path: String) -> Result<Vec<FileInfo>, String> {
    let entries = fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for entry in entries.filter_map(|e| e.ok()) {
        if let Some(info) = file_info_from_path(&entry.path()) {
            results.push(info);
        }
    }
    results.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(results)
}

#[tauri::command]
pub async fn get_file_info(path: String) -> Result<FileInfo, String> {
    file_info_from_path(std::path::Path::new(&path)).ok_or_else(|| "File not found".to_string())
}

#[tauri::command]
pub async fn move_file(source: String, destination: String) -> Result<String, String> {
    fs::rename(&source, &destination).map_err(|e| e.to_string())?;
    Ok(destination)
}

#[tauri::command]
pub async fn move_to_trash(path: String) -> Result<(), String> {
    trash::delete(&path).map_err(|e| e.to_string())
}

#[derive(Deserialize)]
pub struct RenameOperation {
    pub source: String,
    pub new_name: String,
}

#[derive(Serialize)]
pub struct RenameResult {
    pub source: String,
    pub destination: String,
    pub success: bool,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn batch_rename(files: Vec<RenameOperation>) -> Result<Vec<RenameResult>, String> {
    let mut results = Vec::new();
    for op in files {
        let src = std::path::Path::new(&op.source);
        let dest = src.parent().unwrap_or(src).join(&op.new_name);
        let dest_str = dest.to_string_lossy().to_string();
        match fs::rename(&op.source, &dest) {
            Ok(_) => results.push(RenameResult {
                source: op.source,
                destination: dest_str,
                success: true,
                error: None,
            }),
            Err(e) => results.push(RenameResult {
                source: op.source,
                destination: dest_str,
                success: false,
                error: Some(e.to_string()),
            }),
        }
    }
    Ok(results)
}
