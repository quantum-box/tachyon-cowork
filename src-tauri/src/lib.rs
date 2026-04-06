mod commands;
mod mcp;
mod project;
mod sandbox;
mod tools;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
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
                if let Err(e) = tauri::async_runtime::block_on(project_manager.load(&app.handle()))
                {
                    eprintln!("Project startup error: {}", e);
                }
            }

            // Load MCP config and connect enabled servers in background
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                use tauri::Manager;
                let manager = handle.state::<mcp::manager::McpManager>();
                if let Err(e) = manager.load_and_connect_all(&handle).await {
                    eprintln!("MCP startup error: {}", e);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::chat::send_message,
            commands::chat::get_config,
            commands::excel::read_excel,
            commands::excel::write_excel,
            commands::excel::save_excel_to_file,
            commands::pptx::read_pptx_metadata,
            commands::project::project_get_state,
            commands::project::project_set_active,
            commands::project::project_remove_recent,
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

    #[cfg(debug_assertions)]
    {
        builder = builder.plugin(tauri_plugin_webdriver_automation::init());
    }

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
