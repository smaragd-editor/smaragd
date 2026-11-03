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
