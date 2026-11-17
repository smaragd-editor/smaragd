//! Real git commit/push/pull, wired to the Versions menu — previously
//! notImplemented() placeholders. Version Activity (Phase 7) only ever
//! read git state; this is the first command module that writes to it.

use std::collections::VecDeque;
use std::path::Path;
use std::sync::Mutex;

use smaragd_core::git::{self, GitActivityEntry, GitActivityOutcome, GitError};
use smaragd_core::project::Project;
use smaragd_core::project::store::NativeStore;
use smaragd_core::settings::Settings;
use tauri::State;

fn settings() -> Settings {
    smaragd_core::settings::config_file_path()
        .map(|path| Settings::load_from_path(&NativeStore, &path))
        .unwrap_or_default()
}

/// Bounds [`GitActivityState`]'s length — ported from `app::git`'s own
/// `GIT_ACTIVITY_LOG_LIMIT`.
const GIT_ACTIVITY_LOG_LIMIT: usize = 50;

/// A session-scoped log of what this app itself has done (or tried to do)
/// via git — the Tauri-port counterpart of the real app's own
/// `SmaragdApp::git_activity_log`. Unlike every other command module in
/// this crate, this genuinely needs server-held state: `version_activity`
/// is a stateless, recompute-fresh-from-disk command like every other
/// panel query, but "what did *this session* try" isn't something disk
/// remembers — git's own history only has what actually landed as a
/// commit, not a failed push or a no-op commit attempt. Cleared on project
/// open/close by `project::project_open`/`project::project_close`, same as
/// `app::project_lifecycle` clears `git_activity_log` — a previous
/// project's activity has no bearing on this one.
#[derive(Default)]
pub struct GitActivityState(Mutex<VecDeque<GitActivityEntry>>);

impl GitActivityState {
    pub(crate) fn snapshot(&self) -> Vec<GitActivityEntry> {
        self.0
            .lock()
            .expect("git activity state mutex poisoned")
            .iter()
            .cloned()
            .collect()
    }

    pub(crate) fn clear(&self) {
        self.0
            .lock()
            .expect("git activity state mutex poisoned")
            .clear();
    }
}

fn unix_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_secs())
}

/// [`record_activity_with_files`], with no files to attach — every activity
/// except a push/pull's own success.
fn record_activity(
    state: &GitActivityState,
    message: impl Into<String>,
    outcome: GitActivityOutcome,
) {
    record_activity_with_files(state, message, outcome, Vec::new());
}

fn record_activity_with_files(
    state: &GitActivityState,
    message: impl Into<String>,
    outcome: GitActivityOutcome,
    files: Vec<String>,
) {
    let mut log = state.0.lock().expect("git activity state mutex poisoned");
    log.push_front(GitActivityEntry {
        at_unix: unix_now(),
        message: message.into(),
        outcome,
        files,
    });
    log.truncate(GIT_ACTIVITY_LOG_LIMIT);
}

/// "Enable Git Support" (Versions menu's "Enable Git Support" row, shown in
/// place of Commit/Push/Pull until this has run once — or the `:git enable`
/// command prompt command) — mirrors the real app's
/// `enable_git_support_manually` exactly: `git init`s the project folder if
/// it isn't already a repo, then flips `ProjectMeta::git_enabled` on.
#[tauri::command]
pub fn git_enable(state: State<GitActivityState>, root: String) -> Result<(), String> {
    git_enable_impl(&state, &root)
}

pub(crate) fn git_enable_impl(state: &GitActivityState, root: &str) -> Result<(), String> {
    let root = Path::new(root);
    if !git::is_available() {
        return Err("git was not found on this system".to_string());
    }
    if !git::is_repo(root) {
        git::init(root).map_err(|e| e.to_string())?;
    }
    let mut project = Project::load_from_folder(root).map_err(|e| e.to_string())?;
    project.enable_git_support().map_err(|e| e.to_string())?;
    // Matches `enable_git_support_manually`: only the success path is
    // recorded — a failure above already returned its own error, with
    // nothing activity-log-worthy to add to it.
    record_activity(state, "Git support enabled", GitActivityOutcome::Success);
    Ok(())
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

/// Unlike `app::git::run_git_commit`, `NothingToCommit` is still surfaced to
/// the caller as an `Err` (same external contract this command already
/// had) rather than a silent `Ok` — only how it's *recorded* changes, as
/// `Neutral` rather than `Error`, matching the real app's own distinction
/// between "nothing went wrong, there was just nothing to do" and an actual
/// failure.
#[tauri::command]
pub fn git_commit(
    state: State<GitActivityState>,
    root: String,
    message: String,
) -> Result<(), String> {
    git_commit_impl(&state, &root, &message)
}

fn git_commit_impl(state: &GitActivityState, root: &str, message: &str) -> Result<(), String> {
    match git::commit_all(Path::new(root), message) {
        Ok(()) => {
            record_activity(state, "Committed", GitActivityOutcome::Success);
            Ok(())
        }
        Err(GitError::NothingToCommit) => {
            record_activity(state, "Nothing to commit", GitActivityOutcome::Neutral);
            Err(GitError::NothingToCommit.to_string())
        }
        Err(err) => {
            let message = format!("Commit failed: {err}");
            record_activity(state, message.clone(), GitActivityOutcome::Error);
            Err(message)
        }
    }
}

#[derive(Debug, serde::Serialize)]
pub struct PushPullResult {
    files: Vec<String>,
}

#[tauri::command]
pub fn git_push(state: State<GitActivityState>, root: String) -> Result<PushPullResult, String> {
    git_push_or_pull(&state, &root, "Push", git::push)
}

#[tauri::command]
pub fn git_pull(state: State<GitActivityState>, root: String) -> Result<PushPullResult, String> {
    git_push_or_pull(&state, &root, "Pull", git::pull)
}

/// Shared by `git_push`/`git_pull`: both run a `core::git::PushOrPullResult`-
/// returning function and record the outcome identically, differing only in
/// `label` ("Push"/"Pull", used for both the activity message and the error
/// text) and which git operation actually runs.
fn git_push_or_pull(
    state: &GitActivityState,
    root: &str,
    label: &str,
    run: impl FnOnce(&Path) -> git::PushOrPullResult,
) -> Result<PushPullResult, String> {
    let root = Path::new(root);
    match run(root) {
        Ok(files) => {
            let file_lines = git::file_list_lines(root, &files);
            record_activity_with_files(
                state,
                format!("{label}ed"),
                GitActivityOutcome::Success,
                file_lines,
            );
            Ok(PushPullResult {
                files: files
                    .into_iter()
                    .map(|f| f.path.display().to_string())
                    .collect(),
            })
        }
        Err(err) => {
            let message = format!("{label} failed: {err}");
            record_activity(state, message.clone(), GitActivityOutcome::Error);
            Err(message)
        }
    }
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

    fn init_repo_with_identity(root: &Path) {
        git::init(root).unwrap();
        std::process::Command::new("git")
            .current_dir(root)
            .args(["config", "--local", "user.email", "test@example.com"])
            .output()
            .unwrap();
        std::process::Command::new("git")
            .current_dir(root)
            .args(["config", "--local", "user.name", "Smaragd Tests"])
            .output()
            .unwrap();
    }

    #[test]
    fn git_enable_inits_a_repo_flips_the_project_flag_and_records_activity() {
        if !git::is_available() {
            return; // nothing to test on a machine without git installed
        }
        let dir = tempfile::tempdir().unwrap();
        Project::initialize(dir.path()).unwrap();
        assert!(!git::is_repo(dir.path()));
        let state = GitActivityState::default();

        git_enable_impl(&state, &dir.path().display().to_string()).expect("enable");

        assert!(git::is_repo(dir.path()));
        let project = Project::load_from_folder(dir.path()).unwrap();
        assert!(project.meta.git_enabled);
        let activity = state.snapshot();
        assert_eq!(activity.len(), 1);
        assert_eq!(activity[0].message, "Git support enabled");
        assert_eq!(activity[0].outcome, GitActivityOutcome::Success);

        // Enabling again on an already-initialized repo must not error, and
        // records a second entry the same way the first one did.
        git_enable_impl(&state, &dir.path().display().to_string()).expect("re-enable");
        assert_eq!(state.snapshot().len(), 2);
    }

    #[test]
    fn git_commit_message_preview_succeeds_once_the_repo_exists() {
        if !git::is_available() {
            return;
        }
        let dir = tempfile::tempdir().unwrap();
        Project::initialize(dir.path()).unwrap();
        git_enable_impl(
            &GitActivityState::default(),
            &dir.path().display().to_string(),
        )
        .expect("enable");
        std::fs::write(dir.path().join("Draft.md"), "hello").unwrap();

        let preview =
            git_commit_message_preview(dir.path().display().to_string()).expect("preview");
        assert!(!preview.is_empty());
    }

    #[test]
    fn git_commit_records_a_successful_commit() {
        if !git::is_available() {
            return;
        }
        let dir = tempfile::tempdir().unwrap();
        let project = Project::initialize(dir.path()).unwrap();
        init_repo_with_identity(&project.root);
        let state = GitActivityState::default();

        git_commit_impl(&state, &dir.path().display().to_string(), "first commit").expect("commit");

        let activity = state.snapshot();
        assert_eq!(activity.len(), 1);
        assert_eq!(activity[0].message, "Committed");
        assert_eq!(activity[0].outcome, GitActivityOutcome::Success);
    }

    #[test]
    fn git_commit_still_errors_on_a_no_op_but_records_it_as_neutral_not_error() {
        if !git::is_available() {
            return;
        }
        let dir = tempfile::tempdir().unwrap();
        let project = Project::initialize(dir.path()).unwrap();
        init_repo_with_identity(&project.root);
        let state = GitActivityState::default();
        git_commit_impl(&state, &dir.path().display().to_string(), "initial commit").unwrap();

        // Nothing changed since that commit, so this one is a no-op.
        let err = git_commit_impl(&state, &dir.path().display().to_string(), "again").unwrap_err();

        assert!(err.contains("nothing to commit"));
        let activity = state.snapshot();
        assert_eq!(activity[0].message, "Nothing to commit");
        assert_eq!(activity[0].outcome, GitActivityOutcome::Neutral);
    }

    #[test]
    fn git_push_or_pull_records_a_failure_as_error_with_the_operation_label() {
        let dir = tempfile::tempdir().unwrap();
        let state = GitActivityState::default();

        // No git repo at all, so the underlying `run` fails immediately —
        // exercising the error path without needing a real remote.
        let err = git_push_or_pull(&state, &dir.path().display().to_string(), "Push", git::push)
            .unwrap_err();

        assert!(err.starts_with("Push failed: "));
        let activity = state.snapshot();
        assert_eq!(activity.len(), 1);
        assert_eq!(activity[0].outcome, GitActivityOutcome::Error);
        assert_eq!(activity[0].message, err);
    }

    #[test]
    fn git_activity_state_truncates_to_the_log_limit_newest_first() {
        let state = GitActivityState::default();
        for n in 0..(GIT_ACTIVITY_LOG_LIMIT + 5) {
            record_activity(&state, format!("entry {n}"), GitActivityOutcome::Success);
        }

        let activity = state.snapshot();
        assert_eq!(activity.len(), GIT_ACTIVITY_LOG_LIMIT);
        assert_eq!(
            activity[0].message,
            format!("entry {}", GIT_ACTIVITY_LOG_LIMIT + 4)
        );
    }

    #[test]
    fn git_activity_state_clear_empties_the_log() {
        let state = GitActivityState::default();
        record_activity(&state, "something", GitActivityOutcome::Success);
        assert_eq!(state.snapshot().len(), 1);

        state.clear();

        assert!(state.snapshot().is_empty());
    }
}
