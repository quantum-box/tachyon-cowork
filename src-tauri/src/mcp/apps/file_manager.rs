use serde_json::json;

use super::{BuiltinAppInfo, BuiltinToolDef};
use crate::commands::{file_manage, file_organize};

pub fn app_info() -> BuiltinAppInfo {
    BuiltinAppInfo {
        id: "file_manager".to_string(),
        name: "File Manager".to_string(),
        description: "ローカルファイルの検索・閲覧・操作を行うツール群".to_string(),
        tools: vec![
            BuiltinToolDef {
                name: "list_directory".to_string(),
                description: "ディレクトリ内のファイル・フォルダ一覧を取得する".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "ディレクトリのパス" }
                    },
                    "required": ["path"]
                }),
            },
            BuiltinToolDef {
                name: "search_files".to_string(),
                description: "ファイル名パターンや拡張子でファイルを検索する".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "directory": { "type": "string", "description": "検索対象ディレクトリ" },
                        "pattern": { "type": "string", "description": "ファイル名パターン（部分一致）" },
                        "extensions": {
                            "type": "array",
                            "items": { "type": "string" },
                            "description": "拡張子フィルタ（例: [\"pdf\", \"docx\"]）"
                        },
                        "max_results": { "type": "integer", "description": "最大結果数（デフォルト200）" }
                    },
                    "required": ["directory"]
                }),
            },
            BuiltinToolDef {
                name: "get_file_info".to_string(),
                description: "ファイルのメタデータ（サイズ、更新日時、MIMEタイプ等）を取得する"
                    .to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "ファイルパス" }
                    },
                    "required": ["path"]
                }),
            },
            BuiltinToolDef {
                name: "read_text_file".to_string(),
                description: "テキストファイルの内容を読み取る".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "ファイルパス" },
                        "max_bytes": {
                            "type": "integer",
                            "description": "読み取る最大バイト数（デフォルト: 1MB）"
                        }
                    },
                    "required": ["path"]
                }),
            },
            BuiltinToolDef {
                name: "write_text_file".to_string(),
                description: "テキストファイルにコンテンツを書き込む".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "ファイルパス" },
                        "content": { "type": "string", "description": "書き込む内容" }
                    },
                    "required": ["path", "content"]
                }),
            },
            BuiltinToolDef {
                name: "create_directory".to_string(),
                description: "ディレクトリを作成する（ネストも可）".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "作成するディレクトリパス" }
                    },
                    "required": ["path"]
                }),
            },
            BuiltinToolDef {
                name: "move_file".to_string(),
                description: "ファイルを移動またはリネームする".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "source": { "type": "string", "description": "移動元パス" },
                        "destination": { "type": "string", "description": "移動先パス" }
                    },
                    "required": ["source", "destination"]
                }),
            },
            BuiltinToolDef {
                name: "move_to_trash".to_string(),
                description: "ファイルをゴミ箱に移動する".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "削除するファイルパス" }
                    },
                    "required": ["path"]
                }),
            },
            BuiltinToolDef {
                name: "find_duplicates".to_string(),
                description: "ディレクトリ内の重複ファイルを検出する".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "directory": { "type": "string", "description": "検索対象ディレクトリ" },
                        "recursive": { "type": "boolean", "description": "サブディレクトリも検索するか" }
                    },
                    "required": ["directory"]
                }),
            },
            BuiltinToolDef {
                name: "get_disk_usage".to_string(),
                description: "ディレクトリのディスク使用状況を取得する".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "directory": { "type": "string", "description": "対象ディレクトリ" }
                    },
                    "required": ["directory"]
                }),
            },
        ],
    }
}

pub async fn call_tool(name: &str, args: serde_json::Value) -> Result<serde_json::Value, String> {
    match name {
        "list_directory" => {
            let path = get_str(&args, "path")?;
            let result = file_manage::list_directory(path).await?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }
        "search_files" => {
            let directory = get_str(&args, "directory")?;
            let pattern = args
                .get("pattern")
                .and_then(|v| v.as_str())
                .map(String::from);
            let extensions = args.get("extensions").and_then(|v| {
                v.as_array().map(|arr| {
                    arr.iter()
                        .filter_map(|item| item.as_str().map(String::from))
                        .collect::<Vec<_>>()
                })
            });
            let max_results = args
                .get("max_results")
                .and_then(|v| v.as_u64())
                .map(|n| n as usize);
            let result =
                file_manage::search_files(directory, pattern, extensions, max_results).await?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }
        "get_file_info" => {
            let path = get_str(&args, "path")?;
            let result = file_manage::get_file_info(path).await?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }
        "read_text_file" => {
            let path = get_str(&args, "path")?;
            let max_bytes = args
                .get("max_bytes")
                .and_then(|v| v.as_u64())
                .unwrap_or(1_048_576) as usize; // 1MB default
            let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
            let truncated = if content.len() > max_bytes {
                format!("{}...(truncated)", &content[..max_bytes])
            } else {
                content
            };
            Ok(json!({ "content": truncated, "path": path }))
        }
        "write_text_file" => {
            let path = get_str(&args, "path")?;
            let content = get_str(&args, "content")?;
            std::fs::write(&path, &content).map_err(|e| e.to_string())?;
            Ok(json!({ "path": path, "bytes_written": content.len() }))
        }
        "create_directory" => {
            let path = get_str(&args, "path")?;
            std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
            Ok(json!({ "path": path, "created": true }))
        }
        "move_file" => {
            let source = get_str(&args, "source")?;
            let destination = get_str(&args, "destination")?;
            let result = file_manage::move_file(source, destination).await?;
            Ok(json!({ "destination": result }))
        }
        "move_to_trash" => {
            let path = get_str(&args, "path")?;
            file_manage::move_to_trash(path.clone()).await?;
            Ok(json!({ "path": path, "deleted": true }))
        }
        "find_duplicates" => {
            let directory = get_str(&args, "directory")?;
            let recursive = args
                .get("recursive")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);
            let result = file_organize::find_duplicates(directory, recursive).await?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }
        "get_disk_usage" => {
            let directory = get_str(&args, "directory")?;
            let result = file_organize::get_disk_usage(directory).await?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }
        _ => Err(format!("Unknown file_manager tool: {}", name)),
    }
}

fn get_str(args: &serde_json::Value, key: &str) -> Result<String, String> {
    args.get(key)
        .and_then(|v| v.as_str())
        .map(String::from)
        .ok_or_else(|| format!("Missing '{}' argument", key))
}
