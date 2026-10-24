//! The Project Settings dialog (app/src/ui/project_settings_panel.rs in the
//! real egui app) — all 5 of its categories: Git, Sync, Binder (handled by
//! project.rs's `set_binder_color_mode`, already shared with the View menu),
//! Attachments, and Daily Notes, plus Folder Roles and Status/POV colors
//! (not categories of their own in the real app, but shown in this same
//! dialog). None of the core methods below needed any change to be callable
//! from a command; they were already `pub`. Left out of the Attachments
//! category, deliberately: the clipboard image paste size limit — a
//! separate, unrelated toggle this pass didn't need to touch.

use std::collections::BTreeMap;
use std::path::Path;

use serde::Serialize;
use smaragd_core::project::Project;
use smaragd_core::project::model::{BinderNode, BinderNodeKind};
use smaragd_core::project::{AttachmentDestination, BinderColorMode, FolderRole, PicklistField};

use crate::panels::DocumentMetaInput;

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
    daily_note_template: Option<String>,
    folder_roles: Vec<FolderRoleEntry>,
    status_colors: BTreeMap<String, String>,
    pov_colors: BTreeMap<String, String>,
    plugins_enabled: bool,
    git_enabled: bool,
    git_auto_commit_enabled: bool,
    git_auto_commit_interval_minutes: u32,
    git_auto_commit_push_enabled: bool,
    sync_files: bool,
    attachment_destination: AttachmentDestination,
    attachments_folder: Option<String>,
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
        daily_note_template: project
            .daily_note_template()
            .map(|path| path.display().to_string()),
        folder_roles,
        status_colors: project.meta.status_colors.clone(),
        pov_colors: project.meta.pov_colors.clone(),
        plugins_enabled: project.meta.plugins_enabled,
        git_enabled: project.meta.git_enabled,
        git_auto_commit_enabled: project.meta.git_auto_commit_enabled,
        git_auto_commit_interval_minutes: project.meta.resolve_git_auto_commit_interval_minutes(),
        git_auto_commit_push_enabled: project.meta.git_auto_commit_push_enabled,
        sync_files: project.meta.sync_files,
        attachment_destination: project.attachment_destination(),
        attachments_folder: project
            .attachments_folder()
            .map(|path| path.display().to_string()),
    })
}

/// Opts this project's `.smaragd/plugins` directory in or out of the plugin
/// engine — see `smaragd_core::plugins`'s module doc for what a project-local
/// plugin can do and `project::Project::set_plugins_enabled` for the
/// underlying persisted flag. The frontend re-calls `plugins_reload` after
/// this to pick up the change immediately rather than waiting for the next
/// project open.
#[tauri::command]
pub fn set_project_plugins_enabled(root: String, enabled: bool) -> Result<(), String> {
    let mut project = load(&root)?;
    project
        .set_plugins_enabled(enabled)
        .map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct PicklistOptionsDto {
    types: Vec<String>,
    statuses: Vec<String>,
    povs: Vec<String>,
}

/// The Metadata panel's Type/Status/POV dropdown options — each field's
/// assigned picklist folder's document titles (`Project::picklist_documents`),
/// or empty (meaning: that field stays free text) if none is assigned.
#[tauri::command]
pub fn picklist_options(root: String) -> Result<PicklistOptionsDto, String> {
    let project = load(&root)?;
    let titles = |field: PicklistField| -> Vec<String> {
        project
            .picklist_documents(field)
            .into_iter()
            .map(|node| smaragd_core::project::model::document_label(&node.name).to_string())
            .collect()
    };
    Ok(PicklistOptionsDto {
        types: titles(PicklistField::Type),
        statuses: titles(PicklistField::Status),
        povs: titles(PicklistField::Pov),
    })
}

/// A folder's own metadata — `ui::metadata_panel::show_folder`, shown by
/// this port's Metadata panel when a non-root Binder folder row is
/// selected (see `stores/metadataSelection.svelte.ts`), same as the real
/// app's `BinderEvent::SelectFolder`. No word-count/inline-tags fields
/// (unlike a document's `DocumentMetaDto`): a folder has no single open
/// buffer for either to be computed from.
#[derive(Serialize)]
pub struct FolderMetaDto {
    section_type: Option<String>,
    status: Option<String>,
    pov: Option<String>,
    word_count_target: Option<u32>,
    tags: Vec<String>,
}

#[tauri::command]
pub fn folder_metadata(root: String, path: String) -> Result<FolderMetaDto, String> {
    let project = load(&root)?;
    let meta = project.folder_meta(Path::new(&path));
    Ok(FolderMetaDto {
        section_type: meta.section_type,
        status: meta.status,
        pov: meta.pov,
        word_count_target: meta.word_count_target,
        tags: meta.tags,
    })
}

#[tauri::command]
pub fn set_folder_metadata(
    root: String,
    path: String,
    meta: DocumentMetaInput,
) -> Result<(), String> {
    let mut project = load(&root)?;
    let meta = smaragd_core::frontmatter::DocumentMeta {
        section_type: meta.section_type,
        status: meta.status,
        pov: meta.pov,
        word_count_target: meta.word_count_target,
        tags: meta.tags,
    };
    project
        .set_folder_meta(Path::new(&path), meta)
        .map_err(|e| e.to_string())
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

/// `path: None` clears the daily note template (blank note). Errors if
/// `path` isn't a document inside the project — see
/// `Project::set_daily_note_template`'s own validation.
#[tauri::command]
pub fn set_daily_note_template(root: String, path: Option<String>) -> Result<(), String> {
    let mut project = load(&root)?;
    project
        .set_daily_note_template(path.as_deref().map(Path::new))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_git_auto_commit(
    root: String,
    enabled: bool,
    interval_minutes: u32,
    push_enabled: bool,
) -> Result<(), String> {
    let mut project = load(&root)?;
    project
        .set_git_auto_commit_enabled(enabled)
        .map_err(|e| e.to_string())?;
    project
        .set_git_auto_commit_interval_minutes(interval_minutes)
        .map_err(|e| e.to_string())?;
    project
        .set_git_auto_commit_push_enabled(push_enabled)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_sync_files(root: String, enabled: bool) -> Result<(), String> {
    let mut project = load(&root)?;
    project.set_sync_files(enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_attachment_destination(
    root: String,
    destination: AttachmentDestination,
) -> Result<(), String> {
    let mut project = load(&root)?;
    project
        .set_attachment_destination(destination)
        .map_err(|e| e.to_string())
}

/// `path: None` clears the configured attachments folder. Errors if `path`
/// isn't a directory inside the project — see
/// `Project::set_attachments_folder`'s own validation.
#[tauri::command]
pub fn set_attachments_folder(root: String, path: Option<String>) -> Result<(), String> {
    let mut project = load(&root)?;
    project
        .set_attachments_folder(path.as_deref().map(Path::new))
        .map_err(|e| e.to_string())
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
