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
const AGENTS_FILE: &str = "AGENTS.md";
const AGENT_DIR: &str = ".agent";
const SKILL_ROOTS: &[&str] = &[
    ".agent/skills",
    ".codex/skills",
    ".claude/skills",
    ".agents/skills",
];
const MAX_SKILLS: usize = 50;
const MAX_SKILL_DESCRIPTION_CHARS: usize = 1024;

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
pub struct ProjectContext {
    pub root_path: String,
    pub name: String,
    pub workspace_path: String,
    pub agents_path: String,
    pub agent_dir: String,
    pub has_agents_file: bool,
    pub has_agent_dir: bool,
    pub custom_instructions: Option<String>,
    pub prompt_context: String,
    pub skills: Vec<ProjectSkill>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProjectSkill {
    pub name: String,
    pub description: String,
    pub path: String,
    pub directory: String,
    pub source: String,
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

    pub async fn update_active_project_custom_instructions(
        &self,
        app: &AppHandle,
        custom_instructions: String,
    ) -> Result<ProjectContext, String> {
        let _ = app;
        let root = self
            .active_project_root()
            .await
            .ok_or("No active project selected".to_string())?;
        update_workspace_custom_instructions(&root, &custom_instructions)?;
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
        let existing_entry = previous
            .recent_projects
            .iter()
            .find(|entry| entry.path == next_entry.path)
            .cloned();
        let mut recent_projects = previous.recent_projects.clone();

        if existing_entry.is_none() {
            recent_projects.insert(0, next_entry.clone());
            recent_projects.truncate(MAX_RECENT_PROJECTS);
        }

        let next_state = ProjectState {
            active_project: Some(existing_entry.unwrap_or(next_entry)),
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
        let _ = app;
        ensure_agent_dir(&root)?;
        load_project_context(&root)
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

fn load_project_context(root: &Path) -> Result<ProjectContext, String> {
    let paths = workspace_paths(root);
    let has_agents_file = paths.agents_path.is_file();
    let has_agent_dir = paths.agent_dir.is_dir();
    let custom_instructions = read_optional_workspace_file(&paths.agents_path)?;
    let prompt_context = custom_instructions.clone().unwrap_or_default();
    let skills = discover_project_skills(root)?;

    Ok(ProjectContext {
        root_path: root.to_string_lossy().to_string(),
        name: root
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .filter(|name| !name.is_empty())
            .unwrap_or_else(|| root.to_string_lossy().to_string()),
        workspace_path: root.to_string_lossy().to_string(),
        agents_path: paths.agents_path.to_string_lossy().to_string(),
        agent_dir: paths.agent_dir.to_string_lossy().to_string(),
        has_agents_file,
        has_agent_dir,
        custom_instructions,
        prompt_context,
        skills,
    })
}

#[derive(Debug, Clone)]
struct WorkspacePaths {
    agents_path: PathBuf,
    agent_dir: PathBuf,
}

fn workspace_paths(root: &Path) -> WorkspacePaths {
    WorkspacePaths {
        agents_path: root.join(AGENTS_FILE),
        agent_dir: root.join(AGENT_DIR),
    }
}

fn ensure_agent_dir(root: &Path) -> Result<(), String> {
    let paths = workspace_paths(root);
    fs::create_dir_all(&paths.agent_dir).map_err(|e| {
        format!(
            "Failed to create agent directory '{}': {}",
            paths.agent_dir.display(),
            e
        )
    })
}

fn read_optional_workspace_file(path: &Path) -> Result<Option<String>, String> {
    if !path.is_file() {
        return Ok(None);
    }

    let content = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read workspace file '{}': {}", path.display(), e))?;
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    Ok(Some(trimmed.to_string()))
}

fn discover_project_skills(root: &Path) -> Result<Vec<ProjectSkill>, String> {
    let mut skills = Vec::new();

    for skill_root in SKILL_ROOTS {
        let skill_root_path = root.join(skill_root);
        if !skill_root_path.is_dir() {
            continue;
        }

        let entries = fs::read_dir(&skill_root_path).map_err(|e| {
            format!(
                "Failed to read skill directory '{}': {}",
                skill_root_path.display(),
                e
            )
        })?;

        for entry in entries {
            if skills.len() >= MAX_SKILLS {
                return Ok(skills);
            }

            let entry = entry.map_err(|e| {
                format!(
                    "Failed to read skill directory entry '{}': {}",
                    skill_root_path.display(),
                    e
                )
            })?;
            let skill_dir = entry.path();
            if !skill_dir.is_dir() {
                continue;
            }

            let skill_path = skill_dir.join("SKILL.md");
            if !skill_path.is_file() {
                continue;
            }

            let content = fs::read_to_string(&skill_path).map_err(|e| {
                format!(
                    "Failed to read skill file '{}': {}",
                    skill_path.display(),
                    e
                )
            })?;

            if let Some((name, description)) = parse_skill_frontmatter(&content) {
                skills.push(ProjectSkill {
                    name,
                    description,
                    path: skill_path.to_string_lossy().to_string(),
                    directory: skill_dir.to_string_lossy().to_string(),
                    source: skill_root.to_string(),
                });
            }
        }
    }

    skills.sort_by(|a, b| a.name.cmp(&b.name).then_with(|| a.path.cmp(&b.path)));
    Ok(skills)
}

fn parse_skill_frontmatter(content: &str) -> Option<(String, String)> {
    let mut lines = content.lines();
    if lines.next()?.trim() != "---" {
        return None;
    }

    let mut name = None;
    let mut description = None;

    for line in lines {
        let trimmed = line.trim();
        if trimmed == "---" {
            break;
        }
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        let Some((key, value)) = trimmed.split_once(':') else {
            continue;
        };
        let normalized_value = normalize_yaml_scalar(value);
        match key.trim() {
            "name" => name = Some(normalized_value),
            "description" => {
                description = Some(truncate_chars(
                    normalized_value.trim(),
                    MAX_SKILL_DESCRIPTION_CHARS,
                ))
            }
            _ => {}
        }
    }

    let name = name?.trim().to_string();
    let description = description?.trim().to_string();
    if !is_valid_skill_name(&name) || description.is_empty() {
        return None;
    }

    Some((name, description))
}

fn normalize_yaml_scalar(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.len() >= 2 {
        let first = trimmed.as_bytes()[0] as char;
        let last = trimmed.as_bytes()[trimmed.len() - 1] as char;
        if (first == '"' && last == '"') || (first == '\'' && last == '\'') {
            return trimmed[1..trimmed.len() - 1].trim().to_string();
        }
    }
    trimmed.to_string()
}

fn is_valid_skill_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 64
        && name
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

fn update_workspace_custom_instructions(
    root: &Path,
    custom_instructions: &str,
) -> Result<(), String> {
    let trimmed = custom_instructions.trim();
    let paths = workspace_paths(root);

    if trimmed.is_empty() {
        if paths.agents_path.exists() {
            fs::remove_file(&paths.agents_path).map_err(|e| {
                format!(
                    "Failed to remove workspace instructions '{}': {}",
                    paths.agents_path.display(),
                    e
                )
            })?;
        }
        return Ok(());
    }

    fs::create_dir_all(&paths.agent_dir).map_err(|e| {
        format!(
            "Failed to create agent directory '{}': {}",
            paths.agent_dir.display(),
            e
        )
    })?;
    fs::write(&paths.agents_path, format!("{}\n", trimmed)).map_err(|e| {
        format!(
            "Failed to write workspace instructions '{}': {}",
            paths.agents_path.display(),
            e
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_project_dir(name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("tachyon-cowork-{}-{}", name, nonce));
        fs::create_dir_all(&path).expect("temp project dir should be created");
        path
    }

    #[test]
    fn parses_skill_frontmatter_name_and_description() {
        let content = r#"---
name: example-skill
description: "Use when an example workflow is needed."
---

# Example Skill
"#;

        let parsed = parse_skill_frontmatter(content);

        assert_eq!(
            parsed,
            Some((
                "example-skill".to_string(),
                "Use when an example workflow is needed.".to_string()
            ))
        );
    }

    #[test]
    fn ignores_invalid_skill_names() {
        let content = r#"---
name: Example Skill
description: Use when an example workflow is needed.
---
"#;

        assert_eq!(parse_skill_frontmatter(content), None);
    }

    #[test]
    fn discovers_project_skills_from_supported_roots() {
        let root = temp_project_dir("skills");
        let skill_dir = root.join(".codex/skills/example-skill");
        fs::create_dir_all(&skill_dir).expect("skill dir should be created");
        fs::write(
            skill_dir.join("SKILL.md"),
            r#"---
name: example-skill
description: Use when an example workflow is needed.
---

# Example Skill
"#,
        )
        .expect("skill file should be written");

        let skills = discover_project_skills(&root).expect("skills should be discovered");

        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].name, "example-skill");
        assert_eq!(skills[0].source, ".codex/skills");

        let _ = fs::remove_dir_all(root);
    }
}
