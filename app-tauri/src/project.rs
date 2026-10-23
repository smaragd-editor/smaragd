use std::path::Path;

use serde::Serialize;
use smaragd_core::project::Project;
use smaragd_core::project::RestoreError;
use smaragd_core::project::model::{BinderNode, BinderNodeKind};
use smaragd_core::project::store::NativeStore;
use smaragd_core::settings::Settings;

#[derive(Serialize)]
#[serde(tag = "kind")]
pub enum BinderNodeDto {
    Folder {
        name: String,
        path: String,
        children: Vec<BinderNodeDto>,
    },
    Document {
        name: String,
        path: String,
    },
}

impl From<&BinderNode> for BinderNodeDto {
    fn from(node: &BinderNode) -> Self {
        match &node.kind {
            BinderNodeKind::Folder { children } => BinderNodeDto::Folder {
                name: node.name.clone(),
                path: node.path.display().to_string(),
                children: children.iter().map(BinderNodeDto::from).collect(),
            },
            BinderNodeKind::Document => BinderNodeDto::Document {
                name: node.name.clone(),
                path: node.path.display().to_string(),
            },
        }
    }
}

#[derive(Serialize)]
pub struct ProjectSummary {
    root: String,
    book_title: Option<String>,
    tree: BinderNodeDto,
}

impl From<&Project> for ProjectSummary {
    fn from(project: &Project) -> Self {
        ProjectSummary {
            root: project.root.display().to_string(),
            book_title: project.meta.book_title.clone(),
            tree: BinderNodeDto::from(&project.tree.root),
        }
    }
}

/// Open (or re-open) a project at `root` and return its binder tree. Stateless
/// for now — each call re-scans from disk — which is fine at Phase 2 scope; a
/// held-in-memory `Project` (via `tauri::State`) is a later refinement once the
/// editor/autosave work (Phase 3) actually needs one.
#[tauri::command]
pub fn project_open(root: String) -> Result<ProjectSummary, String> {
    let project = Project::load_from_folder(Path::new(&root)).map_err(|e| e.to_string())?;
    Ok(ProjectSummary::from(&project))
}

/// No held state to release yet (see `project_open`'s doc comment) — kept as a
/// real command now so the frontend's open/close lifecycle doesn't need to
/// change shape once one exists.
#[tauri::command]
pub fn project_close() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn project_binder_tree(root: String) -> Result<BinderNodeDto, String> {
    let project = Project::load_from_folder(Path::new(&root)).map_err(|e| e.to_string())?;
    Ok(BinderNodeDto::from(&project.tree.root))
}

#[tauri::command]
pub fn document_read(path: String) -> Result<String, String> {
    smaragd_core::project::store::native_store()
        .read_to_string(Path::new(&path))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn document_save(path: String, contents: String) -> Result<(), String> {
    smaragd_core::project::store::native_store()
        .write(Path::new(&path), contents.as_bytes())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn render_markdown(markdown: String) -> String {
    smaragd_core::markdown::render_html(&markdown)
}

#[derive(Serialize)]
pub struct CreateResult {
    tree: BinderNodeDto,
    path: String,
}

/// Shared shape for `binder_rename`/`binder_move`/`binder_move_before` — each
/// moves or renames exactly one item and, unlike `binder_delete`, needs to
/// report back exactly where that item ended up (so callers like the undo-
/// last-move shortcut can act on it without guessing the extension/collision
/// rules `Project::rename`/`move_item` apply internally).
#[derive(Serialize)]
pub struct BinderOpResult {
    tree: BinderNodeDto,
    path: String,
}

fn load(root: &str) -> Result<Project, String> {
    Project::load_from_folder(Path::new(root)).map_err(|e| e.to_string())
}

/// `rescan()` is called explicitly after every mutation below rather than
/// trusted to each `Project` method's own internals — every one of them
/// already does rescan+persist as part of its contract, but staying explicit
/// here means this command layer doesn't silently break if that ever
/// changes for one call path and not another.
#[tauri::command]
pub fn binder_create_document(
    root: String,
    parent: String,
    name: String,
) -> Result<CreateResult, String> {
    let mut project = load(&root)?;
    let path = project
        .create_document(Path::new(&parent), &name)
        .map_err(|e| e.to_string())?;
    project.rescan();
    Ok(CreateResult {
        tree: BinderNodeDto::from(&project.tree.root),
        path: path.display().to_string(),
    })
}

#[tauri::command]
pub fn binder_create_folder(
    root: String,
    parent: String,
    name: String,
) -> Result<BinderNodeDto, String> {
    let mut project = load(&root)?;
    project
        .create_folder(Path::new(&parent), &name)
        .map_err(|e| e.to_string())?;
    project.rescan();
    Ok(BinderNodeDto::from(&project.tree.root))
}

#[tauri::command]
pub fn binder_rename(
    root: String,
    path: String,
    new_name: String,
) -> Result<BinderOpResult, String> {
    let mut project = load(&root)?;
    let dest = project
        .rename(Path::new(&path), &new_name)
        .map_err(|e| e.to_string())?;
    project.rescan();
    Ok(BinderOpResult {
        tree: BinderNodeDto::from(&project.tree.root),
        path: dest.display().to_string(),
    })
}

/// Whether deleting `path` right now would route it into Trash rather than
/// permanently remove it — lets the frontend word its confirm dialog
/// accurately ("Move to Trash?" vs "This cannot be undone.").
#[tauri::command]
pub fn deletes_to_trash(root: String, path: String) -> Result<bool, String> {
    let project = load(&root)?;
    Ok(project.deletes_to_trash(Path::new(&path)))
}

#[tauri::command]
pub fn binder_delete(root: String, path: String) -> Result<BinderNodeDto, String> {
    let mut project = load(&root)?;
    project
        .delete(Path::new(&path))
        .map_err(|e| e.to_string())?;
    project.rescan();
    Ok(BinderNodeDto::from(&project.tree.root))
}

/// Restore a trashed item to the folder it was deleted from. `recreate`
/// mirrors `Project::restore_from_trash`'s `recreate_missing_folder` flag — the
/// frontend calls this first with `recreate: false`, and on an
/// `ORIGINAL_FOLDER_MISSING:<path>` error, offers to recreate that folder and
/// retries with `recreate: true`, same two-step confirm the real app's own
/// Restore prompt uses.
#[tauri::command]
pub fn binder_restore(
    root: String,
    path: String,
    recreate: bool,
) -> Result<BinderOpResult, String> {
    let mut project = load(&root)?;
    match project.restore_from_trash(Path::new(&path), recreate) {
        Ok(dest) => Ok(BinderOpResult {
            tree: BinderNodeDto::from(&project.tree.root),
            path: dest.display().to_string(),
        }),
        Err(RestoreError::OriginalFolderMissing(folder)) => {
            Err(format!("ORIGINAL_FOLDER_MISSING:{}", folder.display()))
        }
        Err(err) => Err(err.to_string()),
    }
}

#[tauri::command]
pub fn binder_move(
    root: String,
    path: String,
    new_parent: String,
) -> Result<BinderOpResult, String> {
    let mut project = load(&root)?;
    let dest = project
        .move_item(Path::new(&path), Path::new(&new_parent))
        .map_err(|e| e.to_string())?;
    project.rescan();
    Ok(BinderOpResult {
        tree: BinderNodeDto::from(&project.tree.root),
        path: dest.display().to_string(),
    })
}

#[tauri::command]
pub fn binder_move_before(
    root: String,
    path: String,
    before: String,
) -> Result<BinderOpResult, String> {
    let mut project = load(&root)?;
    let dest = project
        .move_item_before(Path::new(&path), Path::new(&before))
        .map_err(|e| e.to_string())?;
    project.rescan();
    Ok(BinderOpResult {
        tree: BinderNodeDto::from(&project.tree.root),
        path: dest.display().to_string(),
    })
}

/// Open (creating from the Daily Notes template if needed) today's daily
/// note — see `Project::open_or_create_daily_note`. Errors with a plain
/// message when Daily Notes isn't enabled for this project, same wording the
/// real app's `ShortcutAction::OpenDailyNote` handler uses.
#[derive(Serialize)]
pub struct DailyNoteResult {
    path: String,
    cursor: Option<usize>,
}

#[tauri::command]
pub fn open_daily_note(root: String) -> Result<DailyNoteResult, String> {
    let mut project = load(&root)?;
    if !project.daily_notes_enabled() {
        return Err("Daily Notes is off — enable it in Project Settings > Daily Notes".to_string());
    }
    let settings = smaragd_core::settings::config_file_path()
        .map(|path| Settings::load_from_path(&NativeStore, &path))
        .unwrap_or_default();
    let (path, cursor) = project
        .open_or_create_daily_note(
            &settings.template_date_format,
            &settings.template_time_format,
        )
        .map_err(|e| e.to_string())?;
    Ok(DailyNoteResult {
        path: path.display().to_string(),
        cursor,
    })
}
