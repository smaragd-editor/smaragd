//! Plugin IPC commands: loads and runs `.rhai` scripts from the global and
//! (if the open project has opted in — see `project_settings::set_project_plugins_enabled`)
//! project-local plugins directory, via `smaragd_core::plugins`. Stateless
//! like every other command module in this crate: each call reloads from
//! scratch rather than holding a live `PluginEngine` across calls — a
//! `.rhai` script is small and loading is cheap (see that module's own doc
//! comment), so this sidesteps needing a `tauri::State` for something that
//! would otherwise be the one piece of server-held session state in an
//! intentionally stateless command layer (see `project.rs`'s own note on
//! this at `load`).
//!
//! The project-local plugin directory is always computed here from an
//! already-validated `root` (the same `root: String` every other command in
//! this crate takes and loads via `Project::load_from_folder`, which fails
//! for anything that isn't a real, already-initialized project) — never
//! accepted as a path argument in its own right, so there's no containment
//! check to apply the way `project::ensure_path_within_root` guards a
//! frontend-supplied `path`/`parent` elsewhere in this crate: there is no
//! such argument here for a caller to redirect.

use std::path::{Path, PathBuf};

use serde::Serialize;
use smaragd_core::plugins::PluginEngine;
use smaragd_core::project::Project;
use smaragd_core::settings::KeyCombo;

/// The plugin directories that currently apply for `root`: the global
/// directory always, plus the project's own `.smaragd/plugins` if it has
/// opted in. Mirrors the real egui app's own `app.rs::plugin_dirs` — a
/// project that fails to load (e.g. `root` no longer exists) just gets the
/// global directory alone, same fail-soft stance plugin loading takes
/// everywhere else.
fn plugin_dirs(root: &str) -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = smaragd_core::plugins::global_plugins_dir()
        .into_iter()
        .collect();
    if let Ok(project) = Project::load_from_folder(Path::new(root))
        && project.meta.plugins_enabled
    {
        dirs.push(project.root.join(".smaragd").join("plugins"));
    }
    dirs
}

/// Loads a fresh [`PluginEngine`] for `root` — the one load path every
/// command below (and `project::document_save`'s `on_save` hook) goes
/// through, so they all see the same directories and the same
/// conflict-resolution behavior.
pub(crate) fn load_engine(root: &str) -> (PluginEngine, Vec<String>) {
    let dirs = plugin_dirs(root);
    let dir_refs: Vec<&Path> = dirs.iter().map(PathBuf::as_path).collect();
    smaragd_core::plugins::load(&dir_refs, Some(Path::new(root)))
}

/// Reloads every plugin for `root` and reports load errors (a script that
/// failed to compile/run, a `:` command name collision) as plain messages —
/// backs the "Reload Plugins" menu item, so a plugin author can iterate
/// without restarting the app.
#[tauri::command]
pub fn plugins_reload(root: String) -> Vec<String> {
    load_engine(&root).1
}

/// The `:` command names every currently loaded plugin registered — backs
/// Command Prompt's plugin-command completion.
#[tauri::command]
pub fn plugins_list_commands(root: String) -> Vec<String> {
    let (engine, _errors) = load_engine(&root);
    engine.command_names().map(str::to_string).collect()
}

#[derive(Serialize)]
pub struct PluginShortcutDefault {
    pub name: String,
    pub combo: KeyCombo,
}

/// Every loaded plugin command's own default keyboard shortcut — the raw
/// declared defaults, unresolved against the user's `Settings::shortcuts`
/// overrides or the built-in shortcuts' own bindings (the frontend already
/// has that resolution logic for the 63 built-ins in `shortcuts.ts`'s
/// `effectiveCombo`/`handleGlobalKeydown`; this feeds plugin shortcuts into
/// the same pass rather than duplicating it here).
#[tauri::command]
pub fn plugins_shortcut_defaults(root: String) -> Vec<PluginShortcutDefault> {
    let (engine, _errors) = load_engine(&root);
    engine
        .shortcut_defaults()
        .map(|(name, combo)| PluginShortcutDefault {
            name: name.to_string(),
            combo,
        })
        .collect()
}

#[derive(Serialize, Default)]
pub struct PluginRunResult {
    pub status_message: Option<String>,
    pub set_document_text: Option<String>,
    /// Set (and the two fields above left at their defaults) if the command
    /// itself failed — e.g. an unregistered name, or a script error. Shown
    /// as a status message by the frontend and otherwise ignored, same
    /// "a broken plugin command must never corrupt app state" stance
    /// `core::plugins::PluginEngine::run_command` documents.
    pub error: Option<String>,
}

/// Runs the plugin command registered as `name` with argument `arg`, giving
/// it the open document's live buffer/basename/filename exactly as the
/// frontend currently holds them (this crate's command layer never holds
/// editor state of its own — see the push-event architecture note in
/// `project.rs`) via `smaragd_document_text()`/`smaragd_document_basename()`/
/// `smaragd_document_filename()`. Never saves — like any other edit, the
/// user's own save action does that.
#[tauri::command]
pub fn plugins_run_command(
    root: String,
    name: String,
    arg: String,
    document_text: Option<String>,
    document_basename: Option<String>,
    document_filename: Option<String>,
) -> PluginRunResult {
    let (engine, _errors) = load_engine(&root);
    let (effects, result) = engine.run_command(
        &name,
        &arg,
        document_text.as_deref(),
        document_basename.as_deref(),
        document_filename.as_deref(),
    );
    match result {
        Ok(()) => PluginRunResult {
            status_message: effects.status_message,
            set_document_text: effects.set_document_text,
            error: None,
        },
        Err(err) => PluginRunResult {
            error: Some(err),
            ..Default::default()
        },
    }
}
