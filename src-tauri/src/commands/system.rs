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
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .ok();
    let desktop = home.as_ref().map(|h| format!("{}/Desktop", h));
    let downloads = home.as_ref().map(|h| format!("{}/Downloads", h));

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
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg("/select,")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        let dir = std::path::Path::new(&path)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or(path);
        std::process::Command::new("xdg-open")
            .arg(&dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
