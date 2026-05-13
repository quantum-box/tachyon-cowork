#[cfg(target_os = "macos")]
use core_graphics::event::{CGEvent, CGEventFlags, CGEventTapLocation};
#[cfg(target_os = "macos")]
use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
use serde::Serialize;
#[cfg(target_os = "macos")]
use tauri::Manager;

#[derive(Serialize)]
pub struct SystemInfo {
    pub os: String,
    pub platform: String,
    pub home_dir: Option<String>,
    pub desktop_dir: Option<String>,
    pub downloads_dir: Option<String>,
}

#[tauri::command]
pub async fn get_system_info() -> Result<SystemInfo, String> {
    let home = dirs::home_dir().map(|path| path.to_string_lossy().to_string());
    let desktop = dirs::desktop_dir().map(|path| path.to_string_lossy().to_string());
    let downloads = dirs::download_dir().map(|path| path.to_string_lossy().to_string());

    Ok(SystemInfo {
        os: std::env::consts::OS.to_string(),
        platform: std::env::consts::ARCH.to_string(),
        home_dir: home,
        desktop_dir: desktop,
        downloads_dir: downloads,
    })
}

#[tauri::command]
pub async fn show_in_folder(path: String) -> Result<(), String> {
    #[cfg(any(target_os = "ios", target_os = "android"))]
    {
        let _ = path;
        Err("Showing files in the system folder is not supported on mobile builds.".to_string())
    }

    #[cfg(not(any(target_os = "ios", target_os = "android")))]
    {
        let canonical =
            std::fs::canonicalize(&path).unwrap_or_else(|_| std::path::PathBuf::from(&path));

        #[cfg(target_os = "macos")]
        {
            std::process::Command::new("open")
                .arg("-R")
                .arg(&canonical)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        #[cfg(target_os = "windows")]
        {
            std::process::Command::new("explorer")
                .arg(format!("/select,{}", canonical.display()))
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        #[cfg(target_os = "linux")]
        {
            let dir = canonical
                .parent()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|| canonical.to_string_lossy().to_string());
            std::process::Command::new("xdg-open")
                .arg(&dir)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}

#[tauri::command]
pub async fn insert_text_to_focused_app(text: String) -> Result<(), String> {
    if text.trim().is_empty() {
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        let text = text.clone();
        tauri::async_runtime::spawn_blocking(move || insert_text_to_focused_app_macos(&text))
            .await
            .map_err(|e| e.to_string())?
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = text;
        Err("任意フォームへの音声入力は現在 macOS のみ対応です。".to_string())
    }
}

#[tauri::command]
pub async fn press_cmd_enter_to_focused_app() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        tauri::async_runtime::spawn_blocking(press_cmd_enter_to_focused_app_macos)
            .await
            .map_err(|e| e.to_string())?
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("任意フォームの Cmd+Enter 送信は現在 macOS のみ対応です。".to_string())
    }
}

#[tauri::command]
pub async fn apply_voice_dot_window_shape(
    app: tauri::AppHandle,
    radius: Option<f64>,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let radius = radius.unwrap_or(6.0).clamp(1.0, 24.0);
        let window = app
            .get_webview_window("voice-input")
            .ok_or_else(|| "Voice Dot window is not available.".to_string())?;
        let (tx, rx) = std::sync::mpsc::channel();

        window
            .clone()
            .run_on_main_thread(move || {
                let _ = tx.send(apply_voice_dot_window_shape_macos(&window, radius));
            })
            .map_err(|e| e.to_string())?;

        rx.recv().map_err(|e| e.to_string())?
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        let _ = radius;
        Ok(())
    }
}

#[tauri::command]
pub async fn set_voice_dot_tray_visible(
    app: tauri::AppHandle,
    visible: bool,
) -> Result<(), String> {
    #[cfg(desktop)]
    {
        if let Some(tray) = app.tray_by_id("voice_dot") {
            tray.set_visible(visible).map_err(|e| e.to_string())?;
        }
    }

    #[cfg(not(desktop))]
    {
        let _ = app;
        let _ = visible;
    }

    Ok(())
}

#[cfg(target_os = "macos")]
fn apply_voice_dot_window_shape_macos(
    window: &tauri::WebviewWindow,
    radius: f64,
) -> Result<(), String> {
    use objc2::rc::Retained;
    use objc2_app_kit::{NSColor, NSView, NSWindow};

    unsafe {
        let ns_window = window
            .ns_window()
            .map_err(|e| e.to_string())?
            .cast::<NSWindow>();
        let ns_view = window
            .ns_view()
            .map_err(|e| e.to_string())?
            .cast::<NSView>();

        (*ns_window).setOpaque(false);
        (*ns_window).setBackgroundColor(Some(&NSColor::clearColor()));
        (*ns_window).setHasShadow(true);

        apply_corner_radius_to_view(ns_view, radius)?;
        if let Some(content_view) = (*ns_window).contentView() {
            apply_corner_radius_to_view(
                Retained::<NSView>::as_ptr(&content_view) as *mut NSView,
                radius,
            )?;
        }
    }

    Ok(())
}

#[cfg(target_os = "macos")]
unsafe fn apply_corner_radius_to_view(
    view: *mut objc2_app_kit::NSView,
    radius: f64,
) -> Result<(), String> {
    if view.is_null() {
        return Err("Voice Dot native view is not available.".to_string());
    }

    (*view).setWantsLayer(true);
    let layer = (*view)
        .layer()
        .ok_or_else(|| "Voice Dot native view layer is not available.".to_string())?;
    layer.setCornerRadius(radius);
    layer.setMasksToBounds(true);

    Ok(())
}

#[cfg(target_os = "macos")]
fn press_cmd_enter_to_focused_app_macos() -> Result<(), String> {
    let source = CGEventSource::new(CGEventSourceStateID::HIDSystemState)
        .or_else(|_| CGEventSource::new(CGEventSourceStateID::CombinedSessionState))
        .map_err(|_| "CGEventSource の作成に失敗しました。".to_string())?;
    let flags = CGEventFlags::CGEventFlagCommand;
    let enter_keycode = 36;

    let key_down = CGEvent::new_keyboard_event(source.clone(), enter_keycode, true)
        .map_err(|_| "Cmd+Enter キー入力イベントの作成に失敗しました。".to_string())?;
    key_down.set_flags(flags);
    key_down.post(CGEventTapLocation::HID);

    std::thread::sleep(std::time::Duration::from_millis(25));

    let key_up = CGEvent::new_keyboard_event(source, enter_keycode, false)
        .map_err(|_| "Cmd+Enter キー入力イベントの作成に失敗しました。".to_string())?;
    key_up.set_flags(flags);
    key_up.post(CGEventTapLocation::HID);

    Ok(())
}

#[cfg(target_os = "macos")]
fn insert_text_to_focused_app_macos(text: &str) -> Result<(), String> {
    let source = CGEventSource::new(CGEventSourceStateID::HIDSystemState)
        .or_else(|_| CGEventSource::new(CGEventSourceStateID::CombinedSessionState))
        .map_err(|_| "CGEventSource の作成に失敗しました。".to_string())?;

    for chunk in split_utf16_safe_chunks(text, 32) {
        let key_down = CGEvent::new_keyboard_event(source.clone(), 0, true)
            .map_err(|_| "キー入力イベントの作成に失敗しました。".to_string())?;
        key_down.set_string(&chunk);
        key_down.post(CGEventTapLocation::HID);

        let key_up = CGEvent::new_keyboard_event(source.clone(), 0, false)
            .map_err(|_| "キー入力イベントの作成に失敗しました。".to_string())?;
        key_up.set_string(&chunk);
        key_up.post(CGEventTapLocation::HID);

        std::thread::sleep(std::time::Duration::from_millis(8));
    }

    Ok(())
}

#[cfg(target_os = "macos")]
fn split_utf16_safe_chunks(text: &str, max_utf16_len: usize) -> Vec<String> {
    let mut chunks = Vec::new();
    let mut current = String::new();
    let mut current_len = 0;

    for ch in text.chars() {
        let ch_len = ch.len_utf16();
        if !current.is_empty() && current_len + ch_len > max_utf16_len {
            chunks.push(std::mem::take(&mut current));
            current_len = 0;
        }
        current.push(ch);
        current_len += ch_len;
    }

    if !current.is_empty() {
        chunks.push(current);
    }

    chunks
}
