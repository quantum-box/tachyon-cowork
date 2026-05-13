mod commands;
mod mcp;
mod project;
mod runtime_auth;
mod sandbox;
mod tools;

#[cfg(target_os = "macos")]
fn ensure_input_monitoring_permission_requested() {
    use core_foundation::base::Boolean;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGPreflightListenEventAccess() -> Boolean;
        fn CGRequestListenEventAccess() -> Boolean;
    }

    let has_access = unsafe { CGPreflightListenEventAccess() != 0 };
    if has_access {
        return;
    }

    let was_granted = unsafe { CGRequestListenEventAccess() != 0 };
    if !was_granted {
        eprintln!("Input Monitoring permission is required for the floating voice Fn shortcut.");
    }
}

#[cfg(target_os = "macos")]
fn install_floating_voice_fn_listener(app: tauri::AppHandle) {
    const LONG_PRESS_THRESHOLD_MS: u64 = 450;

    std::thread::Builder::new()
        .name("floating-voice-fn-listener".to_string())
        .spawn(move || {
            use core_foundation::runloop::CFRunLoop;
            use core_graphics::event::{
                CallbackResult, CGEventFlags, CGEventTap, CGEventTapLocation, CGEventTapOptions,
                CGEventTapPlacement, CGEventType, EventField,
            };
            use std::sync::{
                atomic::{AtomicBool, AtomicU64, Ordering},
                Arc, Mutex,
            };
            use std::time::{Duration, Instant};
            use tauri::{Emitter, Manager};

            const FN_KEYCODE: i64 = 63;

            let fn_down = Arc::new(AtomicBool::new(false));
            let fn_down_for_tap = Arc::clone(&fn_down);
            let hold_started = Arc::new(AtomicBool::new(false));
            let hold_started_for_tap = Arc::clone(&hold_started);
            let press_started_at = Arc::new(Mutex::new(None::<Instant>));
            let press_started_at_for_tap = Arc::clone(&press_started_at);
            let press_sequence = Arc::new(AtomicU64::new(0));
            let press_sequence_for_tap = Arc::clone(&press_sequence);
            let app_for_tap = app.clone();

            let result = CGEventTap::with_enabled(
                CGEventTapLocation::HID,
                CGEventTapPlacement::HeadInsertEventTap,
                CGEventTapOptions::ListenOnly,
                vec![CGEventType::FlagsChanged],
                move |_proxy, _event_type, event| {
                    let keycode = event.get_integer_value_field(EventField::KEYBOARD_EVENT_KEYCODE);
                    if keycode != FN_KEYCODE {
                        return CallbackResult::Keep;
                    }

                    let is_down = event
                        .get_flags()
                        .contains(CGEventFlags::CGEventFlagSecondaryFn);
                    let was_down = fn_down_for_tap.swap(is_down, Ordering::Relaxed);

                    if is_down && !was_down {
                        hold_started_for_tap.store(false, Ordering::Relaxed);
                        if let Ok(mut started_at) = press_started_at_for_tap.lock() {
                            *started_at = Some(Instant::now());
                        }
                        let sequence =
                            press_sequence_for_tap.fetch_add(1, Ordering::Relaxed) + 1;
                        let app_for_hold = app_for_tap.clone();
                        let fn_down_for_hold = Arc::clone(&fn_down_for_tap);
                        let hold_started_for_hold = Arc::clone(&hold_started_for_tap);
                        let press_sequence_for_hold = Arc::clone(&press_sequence_for_tap);

                        std::thread::spawn(move || {
                            std::thread::sleep(Duration::from_millis(LONG_PRESS_THRESHOLD_MS));
                            if fn_down_for_hold.load(Ordering::Relaxed)
                                && press_sequence_for_hold.load(Ordering::Relaxed) == sequence
                                && !hold_started_for_hold.swap(true, Ordering::Relaxed)
                            {
                                if app_for_hold.get_webview_window("voice-input").is_some() {
                                    let _ = app_for_hold.emit_to(
                                        "voice-input",
                                        "floating-voice:hold-start",
                                        (),
                                    );
                                } else {
                                    let _ = app_for_hold.emit_to(
                                        "main",
                                        "floating-voice:hold-start",
                                        (),
                                    );
                                }
                            }
                        });
                    } else if !is_down && was_down {
                        press_sequence_for_tap.fetch_add(1, Ordering::Relaxed);
                        let press_duration = press_started_at_for_tap
                            .lock()
                            .ok()
                            .and_then(|mut started_at| started_at.take())
                            .map(|started_at| started_at.elapsed());

                        if hold_started_for_tap.swap(false, Ordering::Relaxed) {
                            let _ = app_for_tap.emit_to("main", "floating-voice:hold-stop", ());
                            let _ =
                                app_for_tap.emit_to("voice-input", "floating-voice:hold-stop", ());
                        } else if press_duration
                            .is_some_and(|duration| duration.as_millis() >= LONG_PRESS_THRESHOLD_MS as u128)
                        {
                            let _ = app_for_tap.emit_to("main", "floating-voice:hold-stop", ());
                            let _ =
                                app_for_tap.emit_to("voice-input", "floating-voice:hold-stop", ());
                        } else if app_for_tap.get_webview_window("voice-input").is_some() {
                            let _ = app_for_tap.emit_to("voice-input", "floating-voice:toggle", ());
                        } else {
                            let _ = app_for_tap.emit_to("main", "floating-voice:toggle", ());
                        }
                    }

                    CallbackResult::Keep
                },
                CFRunLoop::run_current,
            );

            if result.is_err() {
                eprintln!(
                    "Failed to install Fn key event tap. Input Monitoring permission may be required."
                );
            }
        })
        .expect("failed to spawn floating voice Fn listener");
}

#[cfg(desktop)]
fn install_floating_voice_tray(app: &tauri::App) -> tauri::Result<()> {
    use tauri::{
        menu::{Menu, MenuItem, PredefinedMenuItem},
        tray::TrayIconBuilder,
        Emitter, Manager,
    };

    let new_chat = MenuItem::with_id(
        app,
        "voice_dot_new_chat",
        "新規チャット",
        true,
        None::<&str>,
    )?;
    let open_main = MenuItem::with_id(
        app,
        "voice_dot_open_main",
        "Tachyon Cowork を開く",
        true,
        None::<&str>,
    )?;
    let open_voice = MenuItem::with_id(
        app,
        "voice_dot_open",
        "Voice Dot を開始",
        true,
        None::<&str>,
    )?;
    let hide_voice = MenuItem::with_id(
        app,
        "voice_dot_hide",
        "Voice Dot を隠す",
        true,
        None::<&str>,
    )?;
    let settings = MenuItem::with_id(app, "voice_dot_settings", "設定", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "voice_dot_quit", "終了", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &new_chat,
            &open_main,
            &PredefinedMenuItem::separator(app)?,
            &open_voice,
            &hide_voice,
            &PredefinedMenuItem::separator(app)?,
            &settings,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;
    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/menubar-template.png"))
        .ok()
        .or_else(|| app.default_window_icon().cloned());

    let mut tray = TrayIconBuilder::with_id("voice_dot")
        .menu(&menu)
        .tooltip("Voice Dot")
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "voice_dot_new_chat" => {
                show_main_window(app);
                let _ = app.emit_to("main", "voice-dot:new-chat", ());
            }
            "voice_dot_open_main" => {
                show_main_window(app);
            }
            "voice_dot_open" => {
                show_main_window(app);
                let _ = app.emit_to("main", "floating-voice:start", ());
            }
            "voice_dot_hide" => {
                let _ = app.emit_to("voice-input", "floating-voice:stop-and-hide", ());
                if let Some(window) = app.get_webview_window("voice-input") {
                    let _ = window.hide();
                }
            }
            "voice_dot_settings" => {
                show_main_window(app);
                let _ = app.emit_to("main", "voice-dot:open-settings", ());
            }
            "voice_dot_quit" => {
                app.exit(0);
            }
            _ => {}
        });

    if let Some(icon) = icon {
        tray = tray.icon(icon).icon_as_template(true);
    }

    tray.build(app)?;
    Ok(())
}

#[cfg(desktop)]
fn show_main_window(app: &tauri::AppHandle) {
    use tauri::Manager;

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_oauth_session::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .manage(mcp::manager::McpManager::new())
        .manage(project::ProjectManager::new())
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                use tauri::Manager;
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }

            {
                use tauri::Manager;
                let project_manager = app.state::<project::ProjectManager>();
                if let Err(e) = tauri::async_runtime::block_on(project_manager.load(app.handle())) {
                    eprintln!("Project startup error: {}", e);
                }
            }

            #[cfg(desktop)]
            {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    use tauri::Manager;
                    let manager = handle.state::<mcp::manager::McpManager>();
                    if let Err(e) = manager.load_and_connect_all(&handle).await {
                        eprintln!("MCP startup error: {}", e);
                    }
                });
            }

            #[cfg(target_os = "macos")]
            {
                ensure_input_monitoring_permission_requested();
                install_floating_voice_fn_listener(app.handle().clone());
            }

            #[cfg(desktop)]
            if let Err(error) = install_floating_voice_tray(app) {
                eprintln!("Failed to install floating voice tray icon: {error}");
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::chat::send_message,
            commands::chat::get_config,
            commands::chat::chat_set_runtime_auth,
            commands::chat::chat_clear_runtime_auth,
            commands::auth_session::auth_session_authenticate,
            commands::excel::read_excel,
            commands::excel::write_excel,
            commands::excel::save_excel_to_file,
            commands::pptx::read_pptx_metadata,
            commands::project::project_get_state,
            commands::project::project_set_active,
            commands::project::project_remove_recent,
            commands::project::project_get_active_context,
            commands::project::project_initialize_active,
            commands::project::project_update_active_custom_instructions,
            tools::executor::execute_tool,
            commands::file_manage::search_files,
            commands::file_manage::list_directory,
            commands::file_manage::get_file_info,
            commands::file_manage::move_file,
            commands::file_manage::move_to_trash,
            commands::file_manage::batch_rename,
            commands::file_organize::organize_files,
            commands::file_organize::execute_organize_plan,
            commands::file_organize::find_duplicates,
            commands::file_organize::get_disk_usage,
            commands::host_fs::host_read_file,
            commands::host_fs::host_write_file,
            commands::host_fs::host_list_dir,
            commands::host_fs::host_execute_command,
            commands::system::get_system_info,
            commands::system::show_in_folder,
            commands::system::insert_text_to_focused_app,
            commands::system::replace_text_in_focused_app,
            commands::system::press_cmd_enter_to_focused_app,
            commands::system::apply_voice_dot_window_shape,
            commands::system::set_voice_dot_tray_visible,
            commands::pdf::read_pdf,
            commands::docx::read_docx,
            commands::sandbox::execute_code,
            commands::sandbox::generate_file,
            commands::sandbox::list_workspace_files,
            commands::sandbox::read_workspace_file,
            commands::sandbox::cleanup_workspace,
            commands::sandbox::cleanup_stale_workspaces,
            mcp::commands::mcp_get_config,
            mcp::commands::mcp_add_server,
            mcp::commands::mcp_remove_server,
            mcp::commands::mcp_toggle_server,
            mcp::commands::mcp_get_tools,
            mcp::commands::mcp_call_tool,
            mcp::commands::mcp_get_server_statuses,
            mcp::commands::mcp_toggle_builtin_app,
            mcp::commands::mcp_get_builtin_apps,
        ]);

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_global_shortcut::Builder::new().build())
            .plugin(tauri_plugin_process::init())
            .plugin(tauri_plugin_updater::Builder::new().build());
    }

    #[cfg(all(debug_assertions, desktop))]
    {
        builder = builder.plugin(tauri_plugin_webdriver_automation::init());
    }

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
