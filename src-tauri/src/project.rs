use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_fs::FsExt;
use tauri_plugin_store::StoreExt;
use tokio::sync::Mutex;

const STORE_KEY: &str = "project-state";
const STORE_FILE: &str = "project-state.json";
const MAX_RECENT_PROJECTS: usize = 8;
const PROJECT_META_DIR: &str = ".tachyon";
const PROJECT_CONFIG_FILE: &str = "project.json";
const PROJECT_CONTEXT_DIR: &str = "context";

const DEFAULT_INSTRUCTIONS: &str = r#"# Instructions

## Goal

- この project で達成したいことを書く

## Constraints

- 守るべき制約を書く

## Definition Of Done

- 完了条件を書く
"#;

const DEFAULT_GLOSSARY: &str = r#"# Glossary

| Term | Meaning |
| --- | --- |
| Example | 用語の意味を書く |
"#;

const DEFAULT_DECISIONS: &str = r#"# Decisions

- Date:
  - Decision:
  - Why:
  - Impact:
"#;

const DEFAULT_TODO: &str = r#"# Todo

## Now

- 進行中の作業

## Next

- 次にやること

## Blockers

- 詰まりどころ
"#;

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectContextFile {
    pub key: String,
    pub path: String,
    pub exists: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectContext {
    pub root_path: String,
    pub name: String,
    pub is_initialized: bool,
    pub config_path: String,
    pub workspace_path: String,
    pub context_dir: String,
    pub summary: Option<String>,
    pub prompt_context: String,
    pub files: Vec<ProjectContextFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ProjectConfig {
    version: u32,
    name: String,
    slug: String,
    summary: Option<String>,
    default_working_directory: String,
    context_directory: String,
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

    pub async fn get_active_context(&self) -> Result<Option<ProjectContext>, String> {
        let active_root = self.active_project_root().await;
        match active_root {
            Some(root) => Ok(Some(load_project_context(&root)?)),
            None => Ok(None),
        }
    }

    pub async fn active_project_working_dir(&self) -> Result<Option<PathBuf>, String> {
        let active_root = match self.active_project_root().await {
            Some(root) => root,
            None => return Ok(None),
        };
        Ok(Some(active_root))
    }

    pub async fn initialize_active_project(
        &self,
        app: &AppHandle,
    ) -> Result<ProjectContext, String> {
        let root = self
            .active_project_root()
            .await
            .ok_or("No active project selected".to_string())?;
        self.initialize_project_at_path(app, root).await
    }

    pub async fn update_active_project_summary(
        &self,
        app: &AppHandle,
        summary: String,
    ) -> Result<ProjectContext, String> {
        let root = self
            .active_project_root()
            .await
            .ok_or("No active project selected".to_string())?;
        self.initialize_project_at_path(app, root.clone()).await?;
        update_project_summary(&root, &summary)?;
        load_project_context(&root)
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
            .clone()
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
            .clone()
            .into_iter()
            .filter(|entry| entry.path != normalized_path)
            .collect::<Vec<_>>();

        let active_project = previous
            .active_project
            .clone()
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

    async fn initialize_project_at_path(
        &self,
        app: &AppHandle,
        root: PathBuf,
    ) -> Result<ProjectContext, String> {
        let meta = project_paths(&root);
        fs::create_dir_all(&meta.context_dir)
            .map_err(|e| format!("Failed to create context directory: {}", e))?;

        write_if_missing(&meta.instructions_path, DEFAULT_INSTRUCTIONS)?;
        write_if_missing(&meta.glossary_path, DEFAULT_GLOSSARY)?;
        write_if_missing(&meta.decisions_path, DEFAULT_DECISIONS)?;
        write_if_missing(&meta.todo_path, DEFAULT_TODO)?;

        let config = ProjectConfig {
            version: 1,
            name: root
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .filter(|name| !name.is_empty())
                .unwrap_or_else(|| root.to_string_lossy().to_string()),
            slug: slugify_path_name(&root),
            summary: Some("Project-specific context and instructions.".into()),
            default_working_directory: ".".to_string(),
            context_directory: to_relative_string(&root, &meta.context_dir),
        };
        let config_json = serde_json::to_string_pretty(&config)
            .map_err(|e| format!("Failed to serialize project config: {}", e))?;
        fs::write(&meta.config_path, format!("{}\n", config_json))
            .map_err(|e| format!("Failed to write project config: {}", e))?;

        let context = load_project_context(&root)?;
        let current_state = self.get_state().await;
        self.sync_scopes(app, &ProjectState::default(), &current_state)?;
        Ok(context)
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

#[derive(Debug, Clone)]
struct ProjectPaths {
    config_path: PathBuf,
    context_dir: PathBuf,
    instructions_path: PathBuf,
    glossary_path: PathBuf,
    decisions_path: PathBuf,
    todo_path: PathBuf,
}

fn project_paths(root: &Path) -> ProjectPaths {
    let meta_dir = root.join(PROJECT_META_DIR);
    let context_dir = meta_dir.join(PROJECT_CONTEXT_DIR);

    ProjectPaths {
        config_path: meta_dir.join(PROJECT_CONFIG_FILE),
        context_dir: context_dir.clone(),
        instructions_path: context_dir.join("instructions.md"),
        glossary_path: context_dir.join("glossary.md"),
        decisions_path: context_dir.join("decisions.md"),
        todo_path: context_dir.join("todo.md"),
    }
}

fn load_project_context(root: &Path) -> Result<ProjectContext, String> {
    let paths = project_paths(root);
    let config = read_project_config(&paths.config_path)?;
    let files = vec![
        ("instructions", paths.instructions_path.clone()),
        ("glossary", paths.glossary_path.clone()),
        ("decisions", paths.decisions_path.clone()),
        ("todo", paths.todo_path.clone()),
    ];

    let mut prompt_sections = Vec::new();
    let mut context_files = Vec::with_capacity(files.len());

    for (key, path) in files {
        let exists = path.is_file();
        context_files.push(ProjectContextFile {
            key: key.to_string(),
            path: path.to_string_lossy().to_string(),
            exists,
        });

        if exists {
            let content = fs::read_to_string(&path).map_err(|e| {
                format!(
                    "Failed to read project context file '{}': {}",
                    path.display(),
                    e
                )
            })?;
            let trimmed = content.trim();
            if !trimmed.is_empty() && !is_default_context_content(key, trimmed) {
                prompt_sections.push(format!("## {}\n{}", capitalize_key(key), trimmed));
            }
        }
    }

    let prompt_context = {
        let mut sections = Vec::new();
        if let Some(summary) = config
            .as_ref()
            .and_then(|value| value.summary.as_ref())
            .filter(|s| !s.trim().is_empty())
        {
            sections.push(format!("Summary: {}", summary.trim()));
        }
        if !prompt_sections.is_empty() {
            sections.push(prompt_sections.join("\n\n"));
        }
        sections.join("\n\n")
    };

    Ok(ProjectContext {
        root_path: root.to_string_lossy().to_string(),
        name: config
            .as_ref()
            .map(|value| value.name.clone())
            .unwrap_or_else(|| {
                root.file_name()
                    .map(|name| name.to_string_lossy().to_string())
                    .filter(|name| !name.is_empty())
                    .unwrap_or_else(|| root.to_string_lossy().to_string())
            }),
        is_initialized: paths.config_path.is_file(),
        config_path: paths.config_path.to_string_lossy().to_string(),
        workspace_path: root.to_string_lossy().to_string(),
        context_dir: paths.context_dir.to_string_lossy().to_string(),
        summary: config.and_then(|value| value.summary),
        prompt_context,
        files: context_files,
    })
}

fn update_project_summary(root: &Path, summary: &str) -> Result<(), String> {
    let paths = project_paths(root);
    let existing = read_project_config(&paths.config_path)?;
    let fallback_name = root
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| root.to_string_lossy().to_string());

    let next = ProjectConfig {
        version: 1,
        name: existing
            .as_ref()
            .map(|value| value.name.clone())
            .unwrap_or(fallback_name),
        slug: existing
            .as_ref()
            .map(|value| value.slug.clone())
            .unwrap_or_else(|| slugify_path_name(root)),
        summary: if summary.trim().is_empty() {
            None
        } else {
            Some(summary.trim().to_string())
        },
        default_working_directory: existing
            .as_ref()
            .map(|value| value.default_working_directory.clone())
            .unwrap_or_else(|| ".".to_string()),
        context_directory: existing
            .as_ref()
            .map(|value| value.context_directory.clone())
            .unwrap_or_else(|| to_relative_string(root, &paths.context_dir)),
    };

    let config_json = serde_json::to_string_pretty(&next)
        .map_err(|e| format!("Failed to serialize project config: {}", e))?;
    fs::write(&paths.config_path, format!("{}\n", config_json))
        .map_err(|e| format!("Failed to write project config: {}", e))
}

fn read_project_config(path: &Path) -> Result<Option<ProjectConfig>, String> {
    if !path.is_file() {
        return Ok(None);
    }

    let content = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read project config '{}': {}", path.display(), e))?;
    let parsed = serde_json::from_str::<ProjectConfig>(&content)
        .map_err(|e| format!("Failed to parse project config '{}': {}", path.display(), e))?;
    Ok(Some(parsed))
}

fn write_if_missing(path: &Path, content: &str) -> Result<(), String> {
    if path.exists() {
        return Ok(());
    }

    fs::write(path, format!("{}\n", content))
        .map_err(|e| format!("Failed to write '{}': {}", path.display(), e))
}

fn to_relative_string(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .to_string()
}

fn slugify_path_name(root: &Path) -> String {
    root.file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "project".to_string())
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

fn capitalize_key(value: &str) -> String {
    let mut chars = value.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}

fn is_default_context_content(key: &str, content: &str) -> bool {
    let default = match key {
        "instructions" => DEFAULT_INSTRUCTIONS,
        "glossary" => DEFAULT_GLOSSARY,
        "decisions" => DEFAULT_DECISIONS,
        "todo" => DEFAULT_TODO,
        _ => return false,
    };

    normalize_multiline(default) == normalize_multiline(content)
}

fn normalize_multiline(value: &str) -> String {
    value
        .lines()
        .map(str::trim_end)
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}
