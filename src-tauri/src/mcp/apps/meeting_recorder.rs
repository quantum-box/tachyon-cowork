use serde_json::json;

use super::{BuiltinAppInfo, BuiltinToolDef};

pub fn app_info() -> BuiltinAppInfo {
    BuiltinAppInfo {
        id: "meeting_recorder".to_string(),
        name: "Meeting Recorder".to_string(),
        description: "会議の録音・文字起こし・議事録生成ツール".to_string(),
        tools: vec![
            BuiltinToolDef {
                name: "start_recording".to_string(),
                description: "マイクからの音声録音を開始する".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "device": {
                            "type": "string",
                            "description": "録音デバイス名（省略時はデフォルトマイク）"
                        },
                        "sample_rate": {
                            "type": "integer",
                            "description": "サンプリングレート（デフォルト: 16000）"
                        }
                    }
                }),
            },
            BuiltinToolDef {
                name: "stop_recording".to_string(),
                description: "録音を停止し、音声ファイルのパスを返す".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {}
                }),
            },
            BuiltinToolDef {
                name: "transcribe".to_string(),
                description: "音声ファイルを文字起こしする（Whisper API使用）".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "audio_path": {
                            "type": "string",
                            "description": "音声ファイルのパス（WAV/MP3/M4A）"
                        },
                        "language": {
                            "type": "string",
                            "description": "言語コード（デフォルト: ja）"
                        }
                    },
                    "required": ["audio_path"]
                }),
            },
            BuiltinToolDef {
                name: "generate_minutes".to_string(),
                description: "文字起こしテキストから議事録を生成する（AI要約）".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "transcript": {
                            "type": "string",
                            "description": "文字起こしテキスト"
                        },
                        "format": {
                            "type": "string",
                            "description": "出力形式: markdown / plain（デフォルト: markdown）"
                        }
                    },
                    "required": ["transcript"]
                }),
            },
            BuiltinToolDef {
                name: "extract_action_items".to_string(),
                description: "議事録やテキストからアクションアイテムを抽出する".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "text": {
                            "type": "string",
                            "description": "議事録テキストまたは文字起こしテキスト"
                        }
                    },
                    "required": ["text"]
                }),
            },
        ],
    }
}

pub async fn call_tool(name: &str, args: serde_json::Value) -> Result<serde_json::Value, String> {
    match name {
        "start_recording" => {
            let _device = args
                .get("device")
                .and_then(|v| v.as_str())
                .unwrap_or("default");
            let _sample_rate = args
                .get("sample_rate")
                .and_then(|v| v.as_u64())
                .unwrap_or(16000);

            // TODO: Implement actual recording with cpal or WebAPI
            Ok(json!({
                "status": "recording_started",
                "message": "録音を開始しました（スタブ実装）",
                "device": _device,
                "sample_rate": _sample_rate
            }))
        }
        "stop_recording" => {
            // TODO: Stop actual recording and return file path
            Ok(json!({
                "status": "recording_stopped",
                "message": "録音を停止しました（スタブ実装）",
                "audio_path": null::<String>,
                "duration_seconds": 0
            }))
        }
        "transcribe" => {
            let audio_path = get_str(&args, "audio_path")?;
            let language = args
                .get("language")
                .and_then(|v| v.as_str())
                .unwrap_or("ja");

            // Verify file exists
            if !std::path::Path::new(&audio_path).exists() {
                return Err(format!("Audio file not found: {}", audio_path));
            }

            // TODO: Implement Whisper API / Deepgram call
            Ok(json!({
                "status": "stub",
                "message": "文字起こしはスタブ実装です。実際のAPI連携は未実装です。",
                "audio_path": audio_path,
                "language": language,
                "transcript": ""
            }))
        }
        "generate_minutes" => {
            let transcript = get_str(&args, "transcript")?;
            let format = args
                .get("format")
                .and_then(|v| v.as_str())
                .unwrap_or("markdown");

            if transcript.is_empty() {
                return Err("Transcript is empty".to_string());
            }

            // TODO: Call Claude API for summarization
            Ok(json!({
                "status": "stub",
                "message": "議事録生成はスタブ実装です。実際のAI要約は未実装です。",
                "format": format,
                "minutes": ""
            }))
        }
        "extract_action_items" => {
            let text = get_str(&args, "text")?;

            if text.is_empty() {
                return Err("Text is empty".to_string());
            }

            // TODO: Call Claude API for action item extraction
            Ok(json!({
                "status": "stub",
                "message": "アクションアイテム抽出はスタブ実装です。実際のAI処理は未実装です。",
                "action_items": []
            }))
        }
        _ => Err(format!("Unknown meeting_recorder tool: {}", name)),
    }
}

fn get_str(args: &serde_json::Value, key: &str) -> Result<String, String> {
    args.get(key)
        .and_then(|v| v.as_str())
        .map(String::from)
        .ok_or_else(|| format!("Missing '{}' argument", key))
}
