use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tauri_plugin_fs::FsExt;
use tauri_plugin_store::StoreExt;
use tokio::sync::Mutex;

const STORE_KEY: &str = "project-state";
const STORE_FILE: &str = "project-state.json";
const MAX_RECENT_PROJECTS: usize = 8;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProjectEntry {
    pub path: String,
    pub name: String,
    pub last_accessed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProjectState {
    pub active_project: Option<ProjectEntry>,
    pub recent_projects: Vec<ProjectEntry>,
}

pub struct ProjectManager {
    state: Mutex<ProjectState>,
}

impl ProjectManager {
    pub fn new() -> Self {
        Self {
            state: Mutex::new(ProjectState::default()),
        }
    }

    pub async fn load(&self, app: &AppHandle) -> Result<(), String> {
        let store = app
            .store(STORE_FILE)
            .map_err(|e| format!("Failed to open project store: {}", e))?;

        let loaded = match store.get(STORE_KEY) {
            Some(value) => serde_json::from_value::<ProjectState>(value.clone())
                .map_err(|e| format!("Failed to parse project state: {}", e))?,
            None => ProjectState::default(),
        };

        let normalized = normalize_state(loaded);
        self.sync_scopes(app, &ProjectState::default(), &normalized)?;
        *self.state.lock().await = normalized;
        Ok(())
    }

    pub async fn get_state(&self) -> ProjectState {
        self.state.lock().await.clone()
    }

    pub async fn active_project_root(&self) -> Option<PathBuf> {
        self.state
            .lock()
            .await
            .active_project
            .as_ref()
            .map(|entry| PathBuf::from(&entry.path))
    }

    pub async fn set_active_project(
        &self,
        app: &AppHandle,
        raw_path: String,
    ) -> Result<ProjectState, String> {
        let path = canonicalize_directory(&raw_path)?;
        let next_entry = project_entry_from_path(&path);

        let mut state = self.state.lock().await;
        let previous = state.clone();
        let mut recent_projects = previous
            .recent_projects
            .into_iter()
            .filter(|entry| entry.path != next_entry.path)
            .collect::<Vec<_>>();
        recent_projects.insert(0, next_entry.clone());
        recent_projects.truncate(MAX_RECENT_PROJECTS);

        let next_state = ProjectState {
            active_project: Some(next_entry),
            recent_projects,
        };

        self.sync_scopes(app, &previous, &next_state)?;
        self.save_state(app, &next_state)?;
        *state = next_state.clone();
        Ok(next_state)
    }

    pub async fn remove_recent_project(
        &self,
        app: &AppHandle,
        raw_path: String,
    ) -> Result<ProjectState, String> {
        let normalized_path = normalize_project_path_for_removal(&raw_path)?;

        let mut state = self.state.lock().await;
        let previous = state.clone();
        let recent_projects = previous
            .recent_projects
            .into_iter()
            .filter(|entry| entry.path != normalized_path)
            .collect::<Vec<_>>();

        let active_project = previous
            .active_project
            .filter(|entry| entry.path != normalized_path);

        let next_state = ProjectState {
            active_project,
            recent_projects,
        };

        self.sync_scopes(app, &previous, &next_state)?;
        self.save_state(app, &next_state)?;
        *state = next_state.clone();
        Ok(next_state)
    }

    fn save_state(&self, app: &AppHandle, state: &ProjectState) -> Result<(), String> {
        let store = app
            .store(STORE_FILE)
            .map_err(|e| format!("Failed to open project store: {}", e))?;

        let value =
            serde_json::to_value(state).map_err(|e| format!("Failed to serialize state: {}", e))?;
        store.set(STORE_KEY, value);
        store
            .save()
            .map_err(|e| format!("Failed to save project store: {}", e))?;
        Ok(())
    }

    fn sync_scopes(
        &self,
        app: &AppHandle,
        previous: &ProjectState,
        next: &ProjectState,
    ) -> Result<(), String> {
        let previous_paths = scoped_paths(previous);
        let next_paths = scoped_paths(next);
        let fs_scope = app.fs_scope();

        for path in next_paths.difference(&previous_paths) {
            fs_scope
                .allow_directory(path, true)
                .map_err(|e| format!("Failed to allow directory '{}': {}", path.display(), e))?;
        }

        for path in previous_paths.difference(&next_paths) {
            fs_scope
                .forbid_directory(path, true)
                .map_err(|e| format!("Failed to revoke directory '{}': {}", path.display(), e))?;
        }

        Ok(())
    }
}

fn normalize_state(state: ProjectState) -> ProjectState {
    let mut unique = HashSet::new();
    let mut recent_projects = state
        .recent_projects
        .into_iter()
        .filter_map(|entry| {
            let path = PathBuf::from(&entry.path);
            if !path.is_dir() {
                return None;
            }
            let canonical = path.canonicalize().ok()?;
            let canonical_str = canonical.to_string_lossy().to_string();
            if !unique.insert(canonical_str.clone()) {
                return None;
            }
            Some(ProjectEntry {
                path: canonical_str,
                name: canonical
                    .file_name()
                    .map(|name| name.to_string_lossy().to_string())
                    .filter(|name| !name.is_empty())
                    .unwrap_or_else(|| canonical.to_string_lossy().to_string()),
                last_accessed_at: entry.last_accessed_at,
            })
        })
        .collect::<Vec<_>>();

    recent_projects.sort_by(|a, b| b.last_accessed_at.cmp(&a.last_accessed_at));
    recent_projects.truncate(MAX_RECENT_PROJECTS);

    let active_project = state.active_project.and_then(|entry| {
        recent_projects
            .iter()
            .find(|candidate| candidate.path == entry.path)
            .cloned()
    });

    ProjectState {
        active_project,
        recent_projects,
    }
}

fn scoped_paths(state: &ProjectState) -> HashSet<PathBuf> {
    state
        .recent_projects
        .iter()
        .map(|entry| PathBuf::from(&entry.path))
        .collect()
}

fn canonicalize_directory(raw_path: &str) -> Result<PathBuf, String> {
    let trimmed = raw_path.trim();
    if trimmed.is_empty() {
        return Err("Project path must not be empty".to_string());
    }

    let path = Path::new(trimmed);
    if !path.is_absolute() {
        return Err(format!(
            "Project path must be absolute (got relative path: {})",
            trimmed
        ));
    }

    let canonical = path
        .canonicalize()
        .map_err(|e| format!("Failed to resolve project path '{}': {}", trimmed, e))?;
    if !canonical.is_dir() {
        return Err(format!("Project path is not a directory: {}", trimmed));
    }
    Ok(canonical)
}

fn project_entry_from_path(path: &Path) -> ProjectEntry {
    ProjectEntry {
        path: path.to_string_lossy().to_string(),
        name: path
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .filter(|name| !name.is_empty())
            .unwrap_or_else(|| path.to_string_lossy().to_string()),
        last_accessed_at: chrono::Utc::now().to_rfc3339(),
    }
}

fn normalize_project_path_for_removal(raw_path: &str) -> Result<String, String> {
    let trimmed = raw_path.trim();
    if trimmed.is_empty() {
        return Err("Project path must not be empty".to_string());
    }

    let path = Path::new(trimmed);
    if !path.is_absolute() {
        return Err(format!(
            "Project path must be absolute (got relative path: {})",
            trimmed
        ));
    }

    if path.exists() {
        Ok(path
            .canonicalize()
            .map_err(|e| format!("Failed to resolve project path '{}': {}", trimmed, e))?
            .to_string_lossy()
            .to_string())
    } else {
        Ok(path.to_string_lossy().to_string())
    }
}
