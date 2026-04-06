use serde::Serialize;

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
