//! The Project Settings dialog (app/src/ui/project_settings_panel.rs in the
//! real egui app) — a bounded subset of its 5 categories: Binder (handled by
//! project.rs's `set_binder_color_mode`, already shared with the View menu),
//! Daily Notes, Folder Roles, and Status/POV colors. Left out of this pass:
//! Git auto-commit config, the Sync "also sync non-text files" toggle, and
//! Attachments destination — each its own small chunk of core methods with
//! no existing command either, same shape as what's here, just not wired
//! yet. None of the core methods below needed any change to be callable
//! from a command; they were already `pub`.

use std::collections::BTreeMap;
use std::path::Path;

use serde::Serialize;
use smaragd_core::project::Project;
use smaragd_core::project::model::{BinderNode, BinderNodeKind};
use smaragd_core::project::{BinderColorMode, FolderRole, PicklistField};

fn load(root: &str) -> Result<Project, String> {
    Project::load_from_folder(Path::new(root)).map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct FolderRoleEntry {
    path: String,
    role: FolderRole,
}

fn collect_folder_roles(project: &Project, node: &BinderNode, out: &mut Vec<FolderRoleEntry>) {
    let BinderNodeKind::Folder { children } = &node.kind else {
        return;
    };
    if let Some(role) = project.folder_role(&node.path) {
        out.push(FolderRoleEntry {
            path: node.path.display().to_string(),
            role,
        });
    }
    for child in children {
        collect_folder_roles(project, child, out);
    }
}

#[derive(Serialize)]
pub struct ProjectSettingsDto {
    binder_color_mode: BinderColorMode,
    daily_notes_enabled: bool,
    daily_notes_folder: String,
    daily_note_filename_format: String,
    folder_roles: Vec<FolderRoleEntry>,
    status_colors: BTreeMap<String, String>,
    pov_colors: BTreeMap<String, String>,
}

/// Everything the Project Settings dialog shows, in one round trip rather
/// than one command per field — the dialog opens all of this at once, so
/// there's no "only fetch what's visible" case to optimize for.
#[tauri::command]
pub fn project_settings(root: String) -> Result<ProjectSettingsDto, String> {
    let project = load(&root)?;
    let mut folder_roles = Vec::new();
    collect_folder_roles(&project, &project.tree.root, &mut folder_roles);
    Ok(ProjectSettingsDto {
        binder_color_mode: project.meta.binder_color_mode,
        daily_notes_enabled: project.daily_notes_enabled(),
        daily_notes_folder: project.daily_notes_folder_key().to_string(),
        daily_note_filename_format: project.daily_note_filename_format().to_string(),
        folder_roles,
        status_colors: project.meta.status_colors.clone(),
        pov_colors: project.meta.pov_colors.clone(),
    })
}

#[tauri::command]
pub fn set_project_daily_notes(
    root: String,
    enabled: bool,
    folder: String,
    filename_format: String,
) -> Result<(), String> {
    let mut project = load(&root)?;
    project
        .set_daily_notes_enabled(enabled)
        .map_err(|e| e.to_string())?;
    project
        .set_daily_notes_folder(&folder)
        .map_err(|e| e.to_string())?;
    project
        .set_daily_note_filename_format(filename_format)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// `role: None` clears whatever role `path` currently has.
#[tauri::command]
pub fn set_folder_role(root: String, path: String, role: Option<FolderRole>) -> Result<(), String> {
    let mut project = load(&root)?;
    project
        .set_folder_role(Path::new(&path), role)
        .map_err(|e| e.to_string())
}

/// The Binder's right-click context menu reads this to pre-select the
/// current role in its "Folder Role" submenu — `project_settings`'s bulk
/// `folder_roles` list exists for the dialog, but opening the context menu
/// for one folder shouldn't need a whole-project round trip just to know
/// that folder's own role.
#[tauri::command]
pub fn folder_role(root: String, path: String) -> Result<Option<FolderRole>, String> {
    let project = load(&root)?;
    Ok(project.folder_role(Path::new(&path)))
}

/// Whether `path` is a top-level trashed item (see `Project::trashed_origin`)
/// — the Binder's context menu shows "Restore" only then, same as the real
/// app's own menu.
#[tauri::command]
pub fn is_trashed(root: String, path: String) -> Result<bool, String> {
    let project = load(&root)?;
    Ok(project.trashed_origin(Path::new(&path)).is_some())
}

/// Whether `path` is `field`'s currently assigned "Dropdown Source" folder
/// — the Binder context menu's "Dropdown Source" submenu checkboxes.
#[tauri::command]
pub fn is_picklist_folder(
    root: String,
    field: PicklistField,
    path: String,
) -> Result<bool, String> {
    let project = load(&root)?;
    Ok(project.is_picklist_folder(field, Path::new(&path)))
}

/// `path: None` clears `field`'s assignment.
#[tauri::command]
pub fn set_picklist_folder(
    root: String,
    field: PicklistField,
    path: Option<String>,
) -> Result<(), String> {
    let mut project = load(&root)?;
    project
        .set_picklist_folder(field, path.as_deref().map(Path::new))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_status_color(root: String, status: String, hex: String) -> Result<(), String> {
    let mut project = load(&root)?;
    project
        .set_status_color_hex(&status, hex)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_status_color(root: String, status: String) -> Result<(), String> {
    let mut project = load(&root)?;
    project
        .clear_status_color(&status)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_pov_color(root: String, pov: String, hex: String) -> Result<(), String> {
    let mut project = load(&root)?;
    project
        .set_pov_color_hex(&pov, hex)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_pov_color(root: String, pov: String) -> Result<(), String> {
    let mut project = load(&root)?;
    project.clear_pov_color(&pov).map_err(|e| e.to_string())
}
