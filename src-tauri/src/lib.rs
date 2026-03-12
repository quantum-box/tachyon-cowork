mod commands;
mod tools;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .setup(|_app| {
            #[cfg(debug_assertions)]
            {
                use tauri::Manager;
                let window = _app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::chat::send_message,
            commands::chat::get_config,
            commands::excel::read_excel,
            commands::excel::write_excel,
            commands::excel::save_excel_to_file,
            commands::pptx::read_pptx_metadata,
            tools::executor::execute_tool,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
