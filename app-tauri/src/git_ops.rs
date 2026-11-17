//! Real git commit/push/pull, wired to the Versions menu — previously
//! notImplemented() placeholders. Version Activity (Phase 7) only ever
//! read git state; this is the first command module that writes to it.

use std::path::Path;

use smaragd_core::git;
use smaragd_core::project::Project;
use smaragd_core::project::store::NativeStore;
use smaragd_core::settings::Settings;

fn settings() -> Settings {
    smaragd_core::settings::config_file_path()
        .map(|path| Settings::load_from_path(&NativeStore, &path))
        .unwrap_or_default()
}

/// "Enable Git Support" (Versions menu's "Enable Git Support" row, shown in
/// place of Commit/Push/Pull until this has run once — or the `:git enable`
/// command prompt command) — mirrors the real app's
/// `enable_git_support_manually` exactly: `git init`s the project folder if
/// it isn't already a repo, then flips `ProjectMeta::git_enabled` on.
#[tauri::command]
pub fn git_enable(root: String) -> Result<(), String> {
    let root = Path::new(&root);
    if !git::is_available() {
        return Err("git was not found on this system".to_string());
    }
    if !git::is_repo(root) {
        git::init(root).map_err(|e| e.to_string())?;
    }
    let mut project = Project::load_from_folder(root).map_err(|e| e.to_string())?;
    project.enable_git_support().map_err(|e| e.to_string())
}

/// The commit message a Commit action would use right now — rendered from
/// `Settings::git_commit_message_template` against the project's current
/// dirty-file set, same placeholders the real app's commit prompt fills in
/// ({{date}}, {{time}}, {{numFiles}}, {{linesAdded/Changed/Deleted}},
/// {{fileList}}). The frontend shows this pre-filled, editable, before the
/// user confirms — matching the real app's "pre-filled prompt," not a
/// silent auto-commit.
#[tauri::command]
pub fn git_commit_message_preview(root: String) -> Result<String, String> {
    let root = std::path::Path::new(&root);
    let files = git::changed_files(root).map_err(|e| e.to_string())?;
    let diff = git::diff_stat(root).ok();
    let now = chrono::Local::now();
    let date = now.format("%Y-%m-%d").to_string();
    let time = now.format("%H:%M").to_string();
    let ctx = git::CommitContext {
        date: &date,
        time: &time,
        num_files: files.len(),
        diff: diff.as_ref(),
        files: &files,
        root,
    };
    Ok(git::render_commit_message(
        &settings().resolve_git_commit_message_template(),
        &ctx,
    ))
}

#[tauri::command]
pub fn git_commit(root: String, message: String) -> Result<(), String> {
    git::commit_all(std::path::Path::new(&root), &message).map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
pub struct PushPullResult {
    files: Vec<String>,
}

#[tauri::command]
pub fn git_push(root: String) -> Result<PushPullResult, String> {
    let root = std::path::Path::new(&root);
    let files = git::push(root).map_err(|e| e.to_string())?;
    Ok(PushPullResult {
        files: files
            .into_iter()
            .map(|f| f.path.display().to_string())
            .collect(),
    })
}

#[tauri::command]
pub fn git_pull(root: String) -> Result<PushPullResult, String> {
    let root = std::path::Path::new(&root);
    let files = git::pull(root).map_err(|e| e.to_string())?;
    Ok(PushPullResult {
        files: files
            .into_iter()
            .map(|f| f.path.display().to_string())
            .collect(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn git_commit_message_preview_errors_when_the_project_is_not_a_git_repo() {
        let dir = tempfile::tempdir().unwrap();
        Project::initialize(dir.path()).unwrap();

        assert!(git_commit_message_preview(dir.path().display().to_string()).is_err());
    }

    #[test]
    fn git_enable_inits_a_repo_and_flips_the_project_flag() {
        if !git::is_available() {
            return; // nothing to test on a machine without git installed
        }
        let dir = tempfile::tempdir().unwrap();
        Project::initialize(dir.path()).unwrap();
        assert!(!git::is_repo(dir.path()));

        git_enable(dir.path().display().to_string()).expect("enable");

        assert!(git::is_repo(dir.path()));
        let project = Project::load_from_folder(dir.path()).unwrap();
        assert!(project.meta.git_enabled);
        // Enabling again on an already-initialized repo must not error.
        git_enable(dir.path().display().to_string()).expect("re-enable");
    }

    #[test]
    fn git_commit_message_preview_succeeds_once_the_repo_exists() {
        if !git::is_available() {
            return;
        }
        let dir = tempfile::tempdir().unwrap();
        Project::initialize(dir.path()).unwrap();
        git_enable(dir.path().display().to_string()).expect("enable");
        std::fs::write(dir.path().join("Draft.md"), "hello").unwrap();

        let preview =
            git_commit_message_preview(dir.path().display().to_string()).expect("preview");
        assert!(!preview.is_empty());
    }
}
