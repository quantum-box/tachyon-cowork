use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use walkdir::WalkDir;

#[derive(Serialize, Clone, Deserialize)]
pub struct FileOperation {
    pub source: String,
    pub destination: String,
    pub operation: String, // "move" | "create_dir"
}

#[derive(Serialize)]
pub struct OrganizePlan {
    pub strategy: String,
    pub source_dir: String,
    pub operations: Vec<FileOperation>,
    pub summary: OrganizeSummary,
}

#[derive(Serialize)]
pub struct OrganizeSummary {
    pub total_files: usize,
    pub categories: HashMap<String, usize>,
    pub dirs_to_create: usize,
}

#[tauri::command]
pub async fn organize_files(directory: String, strategy: String) -> Result<OrganizePlan, String> {
    let dir = std::path::Path::new(&directory);
    if !dir.is_dir() {
        return Err("Not a directory".to_string());
    }

    let mut operations = Vec::new();
    let mut categories: HashMap<String, usize> = HashMap::new();
    let mut dirs_to_create = std::collections::HashSet::new();
    let mut total_files = 0usize;

    for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            continue;
        }

        let category = match strategy.as_str() {
            "by_type" => {
                let ext = path
                    .extension()
                    .map(|e| e.to_string_lossy().to_lowercase())
                    .unwrap_or_default();
                match ext.as_str() {
                    "jpg" | "jpeg" | "png" | "gif" | "bmp" | "svg" | "webp" => "画像".to_string(),
                    "mp4" | "avi" | "mov" | "mkv" | "wmv" => "動画".to_string(),
                    "mp3" | "wav" | "flac" | "aac" | "ogg" => "音楽".to_string(),
                    "pdf" => "PDF".to_string(),
                    "doc" | "docx" | "txt" | "rtf" | "md" => "文書".to_string(),
                    "xls" | "xlsx" | "csv" => "スプレッドシート".to_string(),
                    "ppt" | "pptx" => "プレゼン".to_string(),
                    "zip" | "rar" | "7z" | "tar" | "gz" => "アーカイブ".to_string(),
                    "exe" | "msi" | "dmg" | "app" => "アプリ".to_string(),
                    _ => "その他".to_string(),
                }
            }
            "by_date" => {
                let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
                let modified = metadata.modified().map_err(|e| e.to_string())?;
                let dt: chrono::DateTime<chrono::Local> = modified.into();
                dt.format("%Y-%m").to_string()
            }
            "by_extension" => path
                .extension()
                .map(|e| e.to_string_lossy().to_uppercase())
                .unwrap_or_else(|| "NO_EXT".to_string()),
            _ => return Err(format!("Unknown strategy: {}", strategy)),
        };

        let dest_dir = dir.join(&category);
        let dest_dir_str = dest_dir.to_string_lossy().to_string();
        if !dirs_to_create.contains(&dest_dir_str) {
            dirs_to_create.insert(dest_dir_str.clone());
            operations.push(FileOperation {
                source: String::new(),
                destination: dest_dir_str,
                operation: "create_dir".to_string(),
            });
        }

        let file_name = path.file_name().unwrap().to_string_lossy().to_string();
        let dest_file = dest_dir.join(&file_name);
        operations.push(FileOperation {
            source: path.to_string_lossy().to_string(),
            destination: dest_file.to_string_lossy().to_string(),
            operation: "move".to_string(),
        });

        *categories.entry(category).or_insert(0) += 1;
        total_files += 1;
    }

    Ok(OrganizePlan {
        strategy,
        source_dir: directory,
        operations,
        summary: OrganizeSummary {
            total_files,
            categories,
            dirs_to_create: dirs_to_create.len(),
        },
    })
}

#[derive(Serialize)]
pub struct OperationResult {
    pub source: String,
    pub destination: String,
    pub success: bool,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn execute_organize_plan(
    operations: Vec<FileOperation>,
) -> Result<Vec<OperationResult>, String> {
    let mut results = Vec::new();
    for op in operations {
        match op.operation.as_str() {
            "create_dir" => match std::fs::create_dir_all(&op.destination) {
                Ok(_) => results.push(OperationResult {
                    source: op.source,
                    destination: op.destination,
                    success: true,
                    error: None,
                }),
                Err(e) => results.push(OperationResult {
                    source: op.source,
                    destination: op.destination,
                    success: false,
                    error: Some(e.to_string()),
                }),
            },
            "move" => match std::fs::rename(&op.source, &op.destination) {
                Ok(_) => results.push(OperationResult {
                    source: op.source,
                    destination: op.destination,
                    success: true,
                    error: None,
                }),
                Err(e) => results.push(OperationResult {
                    source: op.source,
                    destination: op.destination,
                    success: false,
                    error: Some(e.to_string()),
                }),
            },
            _ => results.push(OperationResult {
                source: op.source,
                destination: op.destination,
                success: false,
                error: Some("Unknown operation".to_string()),
            }),
        }
    }
    Ok(results)
}

#[derive(Serialize)]
pub struct DuplicateGroup {
    pub hash: String,
    pub size: u64,
    pub files: Vec<String>,
}

#[tauri::command]
pub async fn find_duplicates(
    directory: String,
    recursive: bool,
) -> Result<Vec<DuplicateGroup>, String> {
    let max_depth = if recursive { 100 } else { 1 };

    // Phase 1: Group by file size
    let mut size_groups: HashMap<u64, Vec<String>> = HashMap::new();
    for entry in WalkDir::new(&directory)
        .max_depth(max_depth)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
        if size == 0 {
            continue;
        }
        size_groups
            .entry(size)
            .or_default()
            .push(path.to_string_lossy().to_string());
    }

    // Phase 2: Hash files with same size
    let mut hash_groups: HashMap<String, (u64, Vec<String>)> = HashMap::new();
    for (size, paths) in size_groups {
        if paths.len() < 2 {
            continue;
        }
        for path in paths {
            match hash_file(&path) {
                Ok(hash) => {
                    hash_groups
                        .entry(hash)
                        .or_insert_with(|| (size, Vec::new()))
                        .1
                        .push(path);
                }
                Err(_) => continue,
            }
        }
    }

    // Filter to only groups with duplicates
    let duplicates: Vec<DuplicateGroup> = hash_groups
        .into_iter()
        .filter(|(_, (_, files))| files.len() > 1)
        .map(|(hash, (size, files))| DuplicateGroup { hash, size, files })
        .collect();

    Ok(duplicates)
}

fn hash_file(path: &str) -> Result<String, String> {
    let data = std::fs::read(path).map_err(|e| e.to_string())?;
    let hash = blake3::hash(&data);
    Ok(hash.to_hex().to_string())
}

#[derive(Serialize)]
pub struct DiskUsage {
    pub total_size: u64,
    pub file_count: usize,
    pub dir_count: usize,
    pub by_extension: HashMap<String, ExtensionUsage>,
}

#[derive(Serialize)]
pub struct ExtensionUsage {
    pub count: usize,
    pub total_size: u64,
}

#[tauri::command]
pub async fn get_disk_usage(directory: String) -> Result<DiskUsage, String> {
    let mut total_size = 0u64;
    let mut file_count = 0usize;
    let mut dir_count = 0usize;
    let mut by_extension: HashMap<String, ExtensionUsage> = HashMap::new();

    for entry in WalkDir::new(&directory).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.is_dir() {
            dir_count += 1;
            continue;
        }
        let size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
        total_size += size;
        file_count += 1;

        let ext = path
            .extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .unwrap_or_else(|| "(なし)".to_string());

        let usage = by_extension.entry(ext).or_insert(ExtensionUsage {
            count: 0,
            total_size: 0,
        });
        usage.count += 1;
        usage.total_size += size;
    }

    Ok(DiskUsage {
        total_size,
        file_count,
        dir_count,
        by_extension,
    })
}
