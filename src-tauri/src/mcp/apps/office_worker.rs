use base64::Engine;
use serde_json::json;

use super::{BuiltinAppInfo, BuiltinToolDef};
use crate::commands;

pub fn app_info() -> BuiltinAppInfo {
    BuiltinAppInfo {
        id: "office_worker".to_string(),
        name: "Office Worker".to_string(),
        description: "Excel・PowerPoint・PDF・Wordファイルの読み書きツール群".to_string(),
        tools: vec![
            BuiltinToolDef {
                name: "read_excel".to_string(),
                description: "Excelファイル(.xlsx)を読み取り、全シートのデータを返す".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Excelファイルのパス" }
                    },
                    "required": ["path"]
                }),
            },
            BuiltinToolDef {
                name: "write_excel".to_string(),
                description: "Excelファイルを作成し、Base64エンコードしたデータを返す".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "sheets": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "name": { "type": "string", "description": "シート名" },
                                    "headers": {
                                        "type": "array",
                                        "items": { "type": "string" },
                                        "description": "ヘッダー行"
                                    },
                                    "rows": {
                                        "type": "array",
                                        "items": { "type": "array" },
                                        "description": "データ行"
                                    },
                                    "column_widths": {
                                        "type": "array",
                                        "items": { "type": "number" },
                                        "description": "列幅"
                                    }
                                },
                                "required": ["name", "rows"]
                            },
                            "description": "シートデータの配列"
                        }
                    },
                    "required": ["sheets"]
                }),
            },
            BuiltinToolDef {
                name: "save_excel_to_file".to_string(),
                description: "Excelファイルを作成してディスクに保存する".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "保存先パス" },
                        "sheets": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "name": { "type": "string" },
                                    "headers": { "type": "array", "items": { "type": "string" } },
                                    "rows": { "type": "array", "items": { "type": "array" } },
                                    "column_widths": { "type": "array", "items": { "type": "number" } }
                                },
                                "required": ["name", "rows"]
                            }
                        }
                    },
                    "required": ["path", "sheets"]
                }),
            },
            BuiltinToolDef {
                name: "read_pptx".to_string(),
                description: "PowerPointファイル(.pptx)のスライド情報とテキストを読み取る"
                    .to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "PPTXファイルのパス" }
                    },
                    "required": ["path"]
                }),
            },
            BuiltinToolDef {
                name: "read_pdf".to_string(),
                description: "PDFファイルのテキストを読み取る".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "PDFファイルのパス" }
                    },
                    "required": ["path"]
                }),
            },
            BuiltinToolDef {
                name: "read_docx".to_string(),
                description: "Wordファイル(.docx)のテキストを読み取る".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "DOCXファイルのパス" }
                    },
                    "required": ["path"]
                }),
            },
        ],
    }
}

pub async fn call_tool(name: &str, args: serde_json::Value) -> Result<serde_json::Value, String> {
    match name {
        "read_excel" => {
            let path = get_str(&args, "path")?;
            let data = commands::excel::read_excel(path).await?;
            serde_json::to_value(data).map_err(|e| e.to_string())
        }
        "write_excel" => {
            let data: commands::excel::WriteExcelRequest =
                serde_json::from_value(args).map_err(|e| e.to_string())?;
            let bytes = commands::excel::write_excel(data).await?;
            let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
            Ok(json!({ "base64": b64, "size": bytes.len() }))
        }
        "save_excel_to_file" => {
            let path = get_str(&args, "path")?;
            let data: commands::excel::WriteExcelRequest = serde_json::from_value(
                json!({ "sheets": args.get("sheets").cloned().unwrap_or_default() }),
            )
            .map_err(|e| e.to_string())?;
            let result = commands::excel::save_excel_to_file(path, data).await?;
            Ok(json!({ "path": result }))
        }
        "read_pptx" => {
            let path = get_str(&args, "path")?;
            let data = commands::pptx::read_pptx_metadata(path).await?;
            serde_json::to_value(data).map_err(|e| e.to_string())
        }
        "read_pdf" => {
            let path = get_str(&args, "path")?;
            let data = commands::pdf::read_pdf_impl(path).await?;
            serde_json::to_value(data).map_err(|e| e.to_string())
        }
        "read_docx" => {
            let path = get_str(&args, "path")?;
            let data = commands::docx::read_docx_impl(path).await?;
            serde_json::to_value(data).map_err(|e| e.to_string())
        }
        _ => Err(format!("Unknown office_worker tool: {}", name)),
    }
}

fn get_str(args: &serde_json::Value, key: &str) -> Result<String, String> {
    args.get(key)
        .and_then(|v| v.as_str())
        .map(String::from)
        .ok_or_else(|| format!("Missing '{}' argument", key))
}
