use serde_json::json;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use super::{BuiltinAppInfo, BuiltinToolDef};

// ---------------------------------------------------------------------------
// Shared recording state
// ---------------------------------------------------------------------------

struct RecordingState {
    samples: Arc<Mutex<Vec<f32>>>,
    sample_rate: u32,
    channels: u16,
    stream: cpal::Stream,
}

// SAFETY: cpal::Stream is Send but not Sync on some platforms.
// We only access it behind a Mutex from async tasks on the same thread.
unsafe impl Send for RecordingState {}
unsafe impl Sync for RecordingState {}

static RECORDING: Mutex<Option<RecordingState>> = Mutex::new(None);

// ---------------------------------------------------------------------------
// App definition
// ---------------------------------------------------------------------------

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
                description: "音声ファイルを文字起こしする（OpenAI Whisper API使用）".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "audio_path": {
                            "type": "string",
                            "description": "音声ファイルのパス（WAV）"
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
                description: "文字起こしテキストから議事録を生成する（Claude API使用）".to_string(),
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
                description: "議事録やテキストからアクションアイテムを抽出する（Claude API使用）".to_string(),
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

// ---------------------------------------------------------------------------
// Tool dispatch
// ---------------------------------------------------------------------------

pub async fn call_tool(name: &str, args: serde_json::Value) -> Result<serde_json::Value, String> {
    match name {
        "start_recording" => start_recording(args),
        "stop_recording" => stop_recording(),
        "transcribe" => transcribe(args).await,
        "generate_minutes" => generate_minutes(args).await,
        "extract_action_items" => extract_action_items(args).await,
        _ => Err(format!("Unknown meeting_recorder tool: {}", name)),
    }
}

// ---------------------------------------------------------------------------
// start_recording – cpal mic capture
// ---------------------------------------------------------------------------

fn start_recording(args: serde_json::Value) -> Result<serde_json::Value, String> {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

    let mut guard = RECORDING.lock().map_err(|e| e.to_string())?;
    if guard.is_some() {
        return Err("Recording is already in progress".to_string());
    }

    let device_name = args
        .get("device")
        .and_then(|v| v.as_str())
        .unwrap_or("default");
    let requested_sample_rate = args
        .get("sample_rate")
        .and_then(|v| v.as_u64())
        .unwrap_or(16000) as u32;

    let host = cpal::default_host();

    let device = if device_name == "default" {
        host.default_input_device()
            .ok_or("No default input device available")?
    } else {
        host.input_devices()
            .map_err(|e| format!("Failed to enumerate input devices: {}", e))?
            .find(|d| d.name().map(|n| n == device_name).unwrap_or(false))
            .ok_or_else(|| format!("Input device not found: {}", device_name))?
    };

    let actual_device_name = device.name().unwrap_or_else(|_| "unknown".to_string());

    let default_config = device
        .default_input_config()
        .map_err(|e| format!("Failed to get default input config: {}", e))?;

    let channels = default_config.channels();
    let sample_rate = if requested_sample_rate > 0 {
        requested_sample_rate
    } else {
        default_config.sample_rate().0
    };

    let config = cpal::StreamConfig {
        channels,
        sample_rate: cpal::SampleRate(sample_rate),
        buffer_size: cpal::BufferSize::Default,
    };

    let samples: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
    let samples_clone = Arc::clone(&samples);

    let stream = device
        .build_input_stream(
            &config,
            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                if let Ok(mut buf) = samples_clone.lock() {
                    buf.extend_from_slice(data);
                }
            },
            |err| {
                eprintln!("Audio input stream error: {}", err);
            },
            None,
        )
        .map_err(|e| format!("Failed to build input stream: {}", e))?;

    stream
        .play()
        .map_err(|e| format!("Failed to start audio stream: {}", e))?;

    *guard = Some(RecordingState {
        samples,
        sample_rate,
        channels,
        stream,
    });

    Ok(json!({
        "status": "recording_started",
        "message": "録音を開始しました",
        "device": actual_device_name,
        "sample_rate": sample_rate,
        "channels": channels
    }))
}

// ---------------------------------------------------------------------------
// stop_recording – save WAV via hound
// ---------------------------------------------------------------------------

fn stop_recording() -> Result<serde_json::Value, String> {
    let mut guard = RECORDING.lock().map_err(|e| e.to_string())?;
    let state = guard.take().ok_or("No recording in progress")?;

    // Stream is dropped here, stopping capture
    drop(state.stream);

    let samples = state
        .samples
        .lock()
        .map_err(|e| format!("Failed to lock samples: {}", e))?;

    if samples.is_empty() {
        return Err("No audio data was captured".to_string());
    }

    let duration_seconds = samples.len() as f64 / (state.sample_rate as f64 * state.channels as f64);

    // Write WAV file to temp directory
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let filename = format!("meeting_{}.wav", timestamp);
    let dir = std::env::temp_dir().join("tachyon_recordings");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create recordings dir: {}", e))?;
    let path = dir.join(&filename);

    let spec = hound::WavSpec {
        channels: state.channels,
        sample_rate: state.sample_rate,
        bits_per_sample: 32,
        sample_format: hound::SampleFormat::Float,
    };

    let mut writer = hound::WavWriter::create(&path, spec)
        .map_err(|e| format!("Failed to create WAV file: {}", e))?;

    for &sample in samples.iter() {
        writer
            .write_sample(sample)
            .map_err(|e| format!("Failed to write sample: {}", e))?;
    }

    writer
        .finalize()
        .map_err(|e| format!("Failed to finalize WAV: {}", e))?;

    let path_str = path.to_string_lossy().to_string();

    Ok(json!({
        "status": "recording_stopped",
        "message": "録音を停止し、WAVファイルを保存しました",
        "audio_path": path_str,
        "duration_seconds": duration_seconds,
        "sample_rate": state.sample_rate,
        "channels": state.channels,
        "file_size_bytes": std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0)
    }))
}

// ---------------------------------------------------------------------------
// transcribe – OpenAI Whisper API
// ---------------------------------------------------------------------------

async fn transcribe(args: serde_json::Value) -> Result<serde_json::Value, String> {
    let audio_path = get_str(&args, "audio_path")?;
    let language = args
        .get("language")
        .and_then(|v| v.as_str())
        .unwrap_or("ja");

    let path = PathBuf::from(&audio_path);
    if !path.exists() {
        return Err(format!("Audio file not found: {}", audio_path));
    }

    let api_key = std::env::var("OPENAI_API_KEY")
        .map_err(|_| "OPENAI_API_KEY environment variable is not set".to_string())?;

    let file_bytes = tokio::fs::read(&path)
        .await
        .map_err(|e| format!("Failed to read audio file: {}", e))?;

    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "audio.wav".to_string());

    let file_part = reqwest::multipart::Part::bytes(file_bytes)
        .file_name(file_name)
        .mime_str("audio/wav")
        .map_err(|e| format!("Failed to create multipart: {}", e))?;

    let form = reqwest::multipart::Form::new()
        .part("file", file_part)
        .text("model", "whisper-1")
        .text("language", language.to_string())
        .text("response_format", "verbose_json");

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.openai.com/v1/audio/transcriptions")
        .bearer_auth(&api_key)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Whisper API request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Whisper API error ({}): {}", status, body));
    }

    let result: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse Whisper response: {}", e))?;

    let transcript = result
        .get("text")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let duration = result
        .get("duration")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    Ok(json!({
        "status": "success",
        "transcript": transcript,
        "language": language,
        "duration": duration,
        "audio_path": audio_path
    }))
}

// ---------------------------------------------------------------------------
// generate_minutes – Claude API
// ---------------------------------------------------------------------------

async fn generate_minutes(args: serde_json::Value) -> Result<serde_json::Value, String> {
    let transcript = get_str(&args, "transcript")?;
    let format = args
        .get("format")
        .and_then(|v| v.as_str())
        .unwrap_or("markdown");

    if transcript.is_empty() {
        return Err("Transcript is empty".to_string());
    }

    let format_instruction = if format == "plain" {
        "プレーンテキスト形式で出力してください。"
    } else {
        "Markdown形式で出力してください。見出し・箇条書きを使って読みやすく整理してください。"
    };

    let prompt = format!(
        "以下の会議の文字起こしから議事録を作成してください。\n\n\
         要件:\n\
         - 会議の概要（1-2文）\n\
         - 主要な議題と議論内容\n\
         - 決定事項\n\
         - 次のステップ\n\
         {}\n\n\
         --- 文字起こし ---\n{}",
        format_instruction, transcript
    );

    let minutes = call_claude_api(&prompt).await?;

    Ok(json!({
        "status": "success",
        "format": format,
        "minutes": minutes
    }))
}

// ---------------------------------------------------------------------------
// extract_action_items – Claude API
// ---------------------------------------------------------------------------

async fn extract_action_items(args: serde_json::Value) -> Result<serde_json::Value, String> {
    let text = get_str(&args, "text")?;

    if text.is_empty() {
        return Err("Text is empty".to_string());
    }

    let prompt = format!(
        "以下のテキストからアクションアイテムを抽出してください。\n\n\
         各アクションアイテムについて以下のJSON配列形式で出力してください（JSON以外は出力しないこと）:\n\
         [\n\
           {{\n\
             \"action\": \"アクション内容\",\n\
             \"assignee\": \"担当者（不明なら null）\",\n\
             \"deadline\": \"期限（不明なら null）\",\n\
             \"priority\": \"high / medium / low\"\n\
           }}\n\
         ]\n\n\
         --- テキスト ---\n{}",
        text
    );

    let raw = call_claude_api(&prompt).await?;

    // Try to parse as JSON array; if it fails, return the raw text
    let action_items: serde_json::Value = serde_json::from_str(&raw).unwrap_or_else(|_| {
        // Try extracting JSON from markdown code blocks
        let trimmed = raw.trim();
        let json_str = if let Some(start) = trimmed.find('[') {
            if let Some(end) = trimmed.rfind(']') {
                &trimmed[start..=end]
            } else {
                trimmed
            }
        } else {
            trimmed
        };
        serde_json::from_str(json_str).unwrap_or(json!([{"action": raw, "assignee": null, "deadline": null, "priority": "medium"}]))
    });

    Ok(json!({
        "status": "success",
        "action_items": action_items
    }))
}

// ---------------------------------------------------------------------------
// Claude API helper
// ---------------------------------------------------------------------------

async fn call_claude_api(prompt: &str) -> Result<String, String> {
    let api_key = std::env::var("ANTHROPIC_API_KEY")
        .map_err(|_| "ANTHROPIC_API_KEY environment variable is not set".to_string())?;

    let body = json!({
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 4096,
        "messages": [
            {
                "role": "user",
                "content": prompt
            }
        ]
    });

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Claude API request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Claude API error ({}): {}", status, body));
    }

    let result: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse Claude response: {}", e))?;

    let text = result
        .get("content")
        .and_then(|c| c.as_array())
        .and_then(|arr| arr.first())
        .and_then(|block| block.get("text"))
        .and_then(|t| t.as_str())
        .unwrap_or("")
        .to_string();

    Ok(text)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn get_str(args: &serde_json::Value, key: &str) -> Result<String, String> {
    args.get(key)
        .and_then(|v| v.as_str())
        .map(String::from)
        .ok_or_else(|| format!("Missing '{}' argument", key))
}
