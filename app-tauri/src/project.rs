use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::Serialize;
use smaragd_core::project::Project;
use smaragd_core::project::RestoreError;
use smaragd_core::project::model::{BinderNode, BinderNodeKind};
use smaragd_core::project::store::NativeStore;
use smaragd_core::project::{BinderColorMode, FolderRole, store::native_store};
use smaragd_core::project_template;
use smaragd_core::settings::Settings;

#[derive(Serialize)]
#[serde(tag = "kind")]
pub enum BinderNodeDto {
    Folder {
        name: String,
        path: String,
        color: Option<String>,
        role: Option<FolderRole>,
        children: Vec<BinderNodeDto>,
    },
    Document {
        name: String,
        path: String,
        color: Option<String>,
        stats: Option<DocumentStats>,
    },
}

/// Backs the Toggle Document Stats in Binder shortcut/setting — always
/// computed (reading each document is already unconditional once a
/// `WordCountProgress`-shaped read is this cheap; see `build_node_dto`),
/// left to the frontend's `show_document_stats_in_binder` setting to decide
/// whether to actually render.
#[derive(Serialize)]
pub struct DocumentStats {
    lines: usize,
    words: usize,
    chars: usize,
}

/// A red→yellow→green gradient toward a target, ported from the real egui
/// app's `color_theme::word_count_progress_color` (RGB stops `(200,60,60)`→
/// `(230,180,30)`→`(60,180,75)`, each half of `[0,1]` lerped independently) —
/// trivial enough to duplicate here rather than add an egui-free wrapper
/// around it in core for a single caller.
fn word_count_progress_hex(fraction: f64) -> String {
    const RED: (f64, f64, f64) = (200.0, 60.0, 60.0);
    const YELLOW: (f64, f64, f64) = (230.0, 180.0, 30.0);
    const GREEN: (f64, f64, f64) = (60.0, 180.0, 75.0);
    let f = fraction.clamp(0.0, 1.0);
    let (a, b, t) = if f < 0.5 {
        (RED, YELLOW, f / 0.5)
    } else {
        (YELLOW, GREEN, (f - 0.5) / 0.5)
    };
    let lerp = |x: f64, y: f64| (x + (y - x) * t).round() as u8;
    format!(
        "#{:02x}{:02x}{:02x}",
        lerp(a.0, b.0),
        lerp(a.1, b.1),
        lerp(a.2, b.2)
    )
}

/// The color a folder row should show under `mode`, if any — see
/// `BinderColorMode`'s doc comment for what each non-`Off` mode reads from.
/// A document row's own color is computed separately, by
/// `document_color_and_stats`, since it shares that function's single file
/// read rather than doing its own.
fn folder_color(
    project: &Project,
    mode: BinderColorMode,
    path: &std::path::Path,
    folder_word_counts: &HashMap<PathBuf, usize>,
) -> Option<String> {
    match mode {
        BinderColorMode::Off => None,
        BinderColorMode::Status => project
            .status_color_hex(&project.folder_meta(path).status?)
            .map(str::to_string),
        BinderColorMode::Pov => project
            .pov_color_hex(&project.folder_meta(path).pov?)
            .map(str::to_string),
        BinderColorMode::WordCountProgress => {
            let count = *folder_word_counts.get(path).unwrap_or(&0);
            let target = project.folder_meta(path).word_count_target?;
            if target == 0 {
                return None;
            }
            Some(word_count_progress_hex(count as f64 / target as f64))
        }
    }
}

/// A document row's color (if any) and stats (`None` only if the file
/// couldn't be read), computed from one shared read of its contents rather
/// than one read per concern.
fn document_color_and_stats(
    project: &Project,
    mode: BinderColorMode,
    path: &std::path::Path,
) -> (Option<String>, Option<DocumentStats>) {
    let Ok(contents) = native_store().read_to_string(path) else {
        return (None, None);
    };
    let meta = smaragd_core::frontmatter::parse(&contents);
    let color = match mode {
        BinderColorMode::Off => None,
        BinderColorMode::Status => meta
            .status
            .as_deref()
            .and_then(|s| project.status_color_hex(s))
            .map(str::to_string),
        BinderColorMode::Pov => meta
            .pov
            .as_deref()
            .and_then(|p| project.pov_color_hex(p))
            .map(str::to_string),
        BinderColorMode::WordCountProgress => meta.word_count_target.and_then(|target| {
            if target == 0 {
                return None;
            }
            let words = smaragd_core::frontmatter::count_words(&contents);
            Some(word_count_progress_hex(words as f64 / target as f64))
        }),
    };
    let stats = Some(DocumentStats {
        lines: smaragd_core::frontmatter::count_lines(&contents),
        words: smaragd_core::frontmatter::count_words(&contents),
        chars: smaragd_core::frontmatter::count_chars(&contents),
    });
    (color, stats)
}

fn build_node_dto(
    project: &Project,
    mode: BinderColorMode,
    node: &BinderNode,
    folder_word_counts: &HashMap<PathBuf, usize>,
) -> BinderNodeDto {
    match &node.kind {
        BinderNodeKind::Folder { children } => BinderNodeDto::Folder {
            name: node.name.clone(),
            path: node.path.display().to_string(),
            color: folder_color(project, mode, &node.path, folder_word_counts),
            role: project.folder_role(&node.path),
            children: children
                .iter()
                .map(|child| build_node_dto(project, mode, child, folder_word_counts))
                .collect(),
        },
        BinderNodeKind::Document => {
            let (color, stats) = document_color_and_stats(project, mode, &node.path);
            BinderNodeDto::Document {
                name: node.name.clone(),
                path: node.path.display().to_string(),
                color,
                stats,
            }
        }
    }
}

/// Builds the binder tree DTO under the project's current
/// `binder_color_mode` — the single entry point every command below uses
/// instead of walking `project.tree.root` directly, so a row's color always
/// matches whatever mode is active without each call site re-deriving it.
fn build_tree(project: &Project) -> BinderNodeDto {
    let mode = project.meta.binder_color_mode;
    let folder_word_counts = if mode == BinderColorMode::WordCountProgress {
        project.folder_word_counts()
    } else {
        HashMap::new()
    };
    build_node_dto(project, mode, &project.tree.root, &folder_word_counts)
}

#[derive(Serialize)]
pub struct ProjectSummary {
    root: String,
    book_title: Option<String>,
    binder_color_mode: BinderColorMode,
    tree: BinderNodeDto,
    /// `project::sanity_check::check`'s findings, for SanityCheckPrompt.svelte
    /// to show once right after opening — see that module's doc comment.
    /// Empty on the overwhelming common case of a perfectly consistent
    /// project, so this costs nothing extra to always include.
    sanity_check_issues: Vec<String>,
}

fn project_summary(project: &Project) -> ProjectSummary {
    ProjectSummary {
        root: project.root.display().to_string(),
        book_title: project.meta.book_title.clone(),
        binder_color_mode: project.meta.binder_color_mode,
        tree: build_tree(project),
        sanity_check_issues: smaragd_core::project::sanity_check::check(project),
    }
}

/// The fields `ui::metadata_panel::show_project` renders — shown by this
/// port's Metadata panel when the Binder's project-root row is selected
/// (see `stores/metadataSelection.svelte.ts`), same as the real app's
/// `BinderEvent::SelectProject`.
#[derive(Serialize)]
pub struct ProjectMetaFieldsDto {
    book_title: Option<String>,
    book_subtitle: Option<String>,
    book_author: Option<String>,
    point: String,
    logline: String,
    what_if: String,
    synopsis: String,
}

#[tauri::command]
pub fn project_meta_fields(root: String) -> Result<ProjectMetaFieldsDto, String> {
    let project = load(&root)?;
    Ok(ProjectMetaFieldsDto {
        book_title: project.meta.book_title.clone(),
        book_subtitle: project.meta.book_subtitle.clone(),
        book_author: project.meta.book_author.clone(),
        point: project.meta.point.clone(),
        logline: project.meta.logline.clone(),
        what_if: project.meta.what_if.clone(),
        synopsis: project.meta.synopsis.clone(),
    })
}

#[tauri::command]
pub fn set_book_title(root: String, title: String) -> Result<(), String> {
    let mut project = load(&root)?;
    project.set_book_title(title).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_book_subtitle(root: String, subtitle: String) -> Result<(), String> {
    let mut project = load(&root)?;
    project
        .set_book_subtitle(subtitle)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_book_author(root: String, author: String) -> Result<(), String> {
    let mut project = load(&root)?;
    project.set_book_author(author).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_project_point(root: String, point: String) -> Result<(), String> {
    let mut project = load(&root)?;
    project.set_point(point).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_project_logline(root: String, logline: String) -> Result<(), String> {
    let mut project = load(&root)?;
    project.set_logline(logline).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_project_what_if(root: String, what_if: String) -> Result<(), String> {
    let mut project = load(&root)?;
    project.set_what_if(what_if).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_project_synopsis(root: String, synopsis: String) -> Result<(), String> {
    let mut project = load(&root)?;
    project.set_synopsis(synopsis).map_err(|e| e.to_string())
}

pub(crate) fn global_settings() -> Settings {
    smaragd_core::settings::config_file_path()
        .map(|path| Settings::load_from_path(&NativeStore, &path))
        .unwrap_or_default()
}

/// Create the Research/Trash role folders if `Settings::create_starter_folders`
/// is on and they don't already exist — `ensure_role_folder` is itself
/// idempotent, so this is safe to call on every open, not just creation,
/// matching the real app's own `ensure_starter_folders` (which the Tauri
/// port's `project_open` never called until now — a pre-existing gap: the
/// Settings checkbox persisted but had no effect).
fn ensure_starter_folders(project: &mut Project) -> Result<(), String> {
    if !global_settings().create_starter_folders {
        return Ok(());
    }
    project
        .ensure_role_folder(FolderRole::Research, "Research")
        .map_err(|e| e.to_string())?;
    project
        .ensure_role_folder(FolderRole::Trash, "Trash")
        .map_err(|e| e.to_string())?;
    project.rescan();
    Ok(())
}

#[derive(Serialize)]
#[serde(tag = "kind")]
pub enum BackupOutcome {
    Skipped,
    BackedUp,
    Failed { message: String },
}

/// The platform default backup directory, for Settings > Versions to show
/// as a placeholder when `backup_dir` isn't set yet — mirrors
/// `Settings::resolve_backup_dir`'s own fallback without requiring a
/// project root (the frontend's settings dialog has none to pass).
#[tauri::command]
pub fn backup_default_dir() -> Option<String> {
    smaragd_core::backup::default_backup_dir().map(|path| path.display().to_string())
}

/// Take a Scrivener-style zipped backup of the project at `root` if
/// `trigger` ("open"/"close"/"manual_save") is enabled in `Settings` —
/// ports `app::backup::SmaragdApp::run_backup`. Synchronous, like the real
/// app's own version, for the same reason: a backup must actually finish
/// before the frontend's "close project"/"exit" flow moves on, which a
/// fire-and-forget background task can't guarantee. An unknown `trigger`
/// value is treated as never-enabled rather than an error.
#[tauri::command]
pub fn backup_run(root: String, trigger: String) -> BackupOutcome {
    let settings = global_settings();
    let enabled = settings.backup_enabled
        && match trigger.as_str() {
            "open" => settings.backup_on_open,
            "close" => settings.backup_on_close,
            "manual_save" => settings.backup_on_manual_save,
            _ => false,
        };
    if !enabled {
        return BackupOutcome::Skipped;
    }
    let Some(backup_dir) = settings.resolve_backup_dir() else {
        return BackupOutcome::Failed {
            message: "Couldn't determine a backup directory — set one in Settings > Versions"
                .to_string(),
        };
    };
    let project_root = Path::new(&root);
    let project_name = smaragd_core::export::sanitize_filename_component(
        &project_root
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_default(),
    );
    match smaragd_core::backup::create_backup(project_root, &backup_dir, &project_name) {
        Ok(_) => {
            let keep = settings.resolve_backup_keep_count();
            match smaragd_core::backup::prune_old_backups(&backup_dir, &project_name, keep as usize)
            {
                Ok(()) => BackupOutcome::BackedUp,
                Err(err) => BackupOutcome::Failed {
                    message: format!("Backup succeeded, but couldn't remove old backups: {err}"),
                },
            }
        }
        Err(err) => BackupOutcome::Failed {
            message: format!("Backup failed: {err}"),
        },
    }
}

/// Open (or re-open) a project at `root` and return its binder tree. Stateless
/// for now — each call re-scans from disk — which is fine at Phase 2 scope; a
/// held-in-memory `Project` (via `tauri::State`) is a later refinement once the
/// editor/autosave work (Phase 3) actually needs one.
#[tauri::command]
pub fn project_open(root: String) -> Result<ProjectSummary, String> {
    let mut project = Project::load_from_folder(Path::new(&root)).map_err(|e| e.to_string())?;
    ensure_starter_folders(&mut project)?;
    Ok(project_summary(&project))
}

#[derive(Serialize)]
pub struct ProjectTemplateDto {
    id: String,
    label: String,
    description: String,
}

/// The built-in templates plus any custom ones saved under the real app's
/// own `project_template::global_project_templates_dir` — load errors (a
/// malformed custom `template.toml`, an id collision) are silently dropped,
/// same tolerance the real egui app's own loader has, since this port has
/// no "Save Project as Template…" UI yet to produce a custom template a
/// user would need errors about.
fn load_project_templates() -> Vec<project_template::ProjectTemplate> {
    let dir = project_template::global_project_templates_dir();
    let dirs: Vec<&Path> = dir.as_deref().into_iter().collect();
    project_template::load(&dirs).0
}

#[tauri::command]
pub fn project_templates_list() -> Vec<ProjectTemplateDto> {
    load_project_templates()
        .into_iter()
        .map(|t| ProjectTemplateDto {
            id: t.id,
            label: t.label,
            description: t.description,
        })
        .collect()
}

/// Create a brand-new project at `root` (an empty or not-yet-existing
/// folder), stamp `template_id`'s folder/document scaffold onto it, and
/// return its binder tree, same shape as `project_open` — matching the real
/// app's `create_project`, which applies the chosen `ProjectTemplate` right
/// after `Project::initialize` and before `set_project`. Pass `"blank"` for
/// the old template-less behavior. An unknown `template_id` (e.g. a deleted
/// custom template) degrades to no scaffolding, same as the real app,
/// rather than erroring.
#[tauri::command]
pub fn project_create_from_template(
    root: String,
    template_id: String,
) -> Result<ProjectSummary, String> {
    let mut project = Project::initialize(Path::new(&root)).map_err(|e| e.to_string())?;
    let templates = load_project_templates();
    if let Some(template) = project_template::find(&templates, &template_id) {
        template.apply(&mut project).map_err(|e| e.to_string())?;
    }
    ensure_starter_folders(&mut project)?;
    Ok(project_summary(&project))
}

/// Save `root`'s current structure (folder/document names and content, plus
/// its Research/Trash/Templates/Manuscript/World role assignments — never
/// its narrative metadata, see `project_template::save_from_project`'s own
/// doc comment) as a new custom template named `name`, so it shows up in
/// future "New Project" template pickers. Returns the new template's id.
#[tauri::command]
pub fn project_save_as_template(root: String, name: String) -> Result<String, String> {
    let project = load(&root)?;
    let dir = project_template::global_project_templates_dir()
        .ok_or("Couldn't determine templates directory")?;
    project_template::save_from_project(&dir, &name, &project).map_err(|e| e.to_string())
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
    Ok(build_tree(&project))
}

#[tauri::command]
pub fn document_read(path: String) -> Result<String, String> {
    smaragd_core::project::store::native_store()
        .read_to_string(Path::new(&path))
        .map_err(|e| e.to_string())
}

/// The file's modification time, in milliseconds since the Unix epoch —
/// what `document_save`'s own return value and `external_watch`'s polling
/// compare against to notice a write that didn't come from this app.
fn mtime_millis(path: &Path) -> Result<i64, String> {
    let modified = std::fs::metadata(path)
        .and_then(|meta| meta.modified())
        .map_err(|e| e.to_string())?;
    modified
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn document_mtime(path: String) -> Result<i64, String> {
    mtime_millis(Path::new(&path))
}

#[tauri::command]
pub fn document_save(path: String, contents: String) -> Result<i64, String> {
    smaragd_core::project::store::native_store()
        .write(Path::new(&path), contents.as_bytes())
        .map_err(|e| e.to_string())?;
    mtime_millis(Path::new(&path))
}

#[tauri::command]
pub fn render_markdown(markdown: String) -> String {
    // Strip the YAML frontmatter block before rendering — matches the real
    // app's own markdown_preview.rs, which never shows it in Preview/
    // Reading view either (it's metadata for the Metadata panel, not part
    // of the document's prose).
    smaragd_core::markdown::render_html(smaragd_core::frontmatter::strip(&markdown))
}

/// A single Search Everywhere text-search hit.
#[derive(Serialize)]
pub struct TextSearchHit {
    path: String,
    display: String,
    line: usize,
    line_text: String,
    byte_start: usize,
}

/// Cap on hits returned — also what keeps a large project from being
/// scanned past the first page of results, matching the real app's own
/// `search_everywhere.rs::search_text`/`MAX_RESULTS` (which this mirrors
/// rather than reuses, since `app-tauri` doesn't depend on the `app`
/// crate).
const TEXT_SEARCH_LIMIT: usize = 50;
/// Shortest query text search runs for — one or two characters would match
/// nearly every line of a manuscript.
const MIN_TEXT_QUERY_CHARS: usize = 3;

/// Search Everywhere's "Text" tab: a case-insensitive scan of every
/// document's on-disk content (not a live editor buffer — this port
/// autosaves on an 800ms debounce rather than holding open tabs' text
/// server-side, so disk is already near-live).
#[tauri::command]
pub fn search_everywhere_text(root: String, query: String) -> Result<Vec<TextSearchHit>, String> {
    if query.chars().count() < MIN_TEXT_QUERY_CHARS {
        return Ok(Vec::new());
    }
    let project = load(&root)?;
    let store = native_store();
    let mut hits = Vec::new();
    'docs: for path in project.tree.document_paths() {
        let Ok(content) = store.read_to_string(&path) else {
            continue;
        };
        let relative = path.strip_prefix(&project.root).unwrap_or(&path);
        let display =
            smaragd_core::project::model::document_label(&relative.to_string_lossy()).to_string();
        for (byte_start, _) in smaragd_core::search::find_matches(&content, &query, false) {
            if hits.len() == TEXT_SEARCH_LIMIT {
                break 'docs;
            }
            let (line, line_text) = smaragd_core::search::line_at(&content, byte_start);
            hits.push(TextSearchHit {
                path: path.display().to_string(),
                display: display.clone(),
                line,
                line_text,
                byte_start,
            });
        }
    }
    Ok(hits)
}

#[derive(Serialize)]
pub struct FuzzyMatch {
    /// The matched candidate's position in the `candidates` list this came
    /// from — the frontend already holds the richer row data (context,
    /// click handler, ...) for each candidate; this just reorders/filters
    /// it, rather than round-tripping that data through Rust too.
    index: usize,
    score: u32,
}

/// Fuzzy-ranks `candidates` against `query` via `core::fuzzy::fuzzy_rank` —
/// the real `nucleo-matcher`-backed subsequence scorer (Helix picker's own
/// engine), replacing SearchEverywhere.svelte's previous hand-rolled TS
/// substring/subsequence scorer. `paths` tunes the matcher's bonuses for
/// `/`-separated paths (document names); pass `false` for plain labels
/// (action/setting names). An empty `query` returns every candidate in its
/// original order, each scored 0, same as `fuzzy_rank` itself.
#[tauri::command]
pub fn fuzzy_rank_strings(
    candidates: Vec<String>,
    query: String,
    limit: usize,
    paths: bool,
) -> Vec<FuzzyMatch> {
    let indexed: Vec<(usize, String)> = candidates.into_iter().enumerate().collect();
    smaragd_core::fuzzy::fuzzy_rank(&indexed, |(_, s)| s.as_str(), &query, limit, paths)
        .into_iter()
        .map(|(item, score)| FuzzyMatch {
            index: item.0,
            score,
        })
        .collect()
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
        tree: build_tree(&project),
        path: path.display().to_string(),
    })
}

#[derive(Serialize)]
pub struct TemplateDocument {
    path: String,
    name: String,
}

/// The Binder context menu's "New From Template" submenu candidates — the
/// Templates-role folder's direct child documents.
#[tauri::command]
pub fn template_documents(root: String) -> Result<Vec<TemplateDocument>, String> {
    let project = load(&root)?;
    Ok(project
        .template_documents()
        .into_iter()
        .map(|node| TemplateDocument {
            path: node.path.display().to_string(),
            name: node.name.clone(),
        })
        .collect())
}

#[derive(Serialize)]
pub struct CreateFromTemplateResult {
    tree: BinderNodeDto,
    path: String,
    cursor: Option<usize>,
}

#[tauri::command]
pub fn binder_create_document_from_template(
    root: String,
    parent: String,
    name: String,
    template_path: String,
) -> Result<CreateFromTemplateResult, String> {
    let mut project = load(&root)?;
    let settings = global_settings();
    let (path, cursor) = project
        .create_document_from_template(
            Path::new(&parent),
            &name,
            Path::new(&template_path),
            &settings.template_date_format,
            &settings.template_time_format,
        )
        .map_err(|e| e.to_string())?;
    project.rescan();
    Ok(CreateFromTemplateResult {
        tree: build_tree(&project),
        path: path.display().to_string(),
        cursor,
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
    Ok(build_tree(&project))
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
        tree: build_tree(&project),
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
    Ok(build_tree(&project))
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
            tree: build_tree(&project),
            path: dest.display().to_string(),
        }),
        Err(RestoreError::OriginalFolderMissing(folder)) => {
            Err(format!("ORIGINAL_FOLDER_MISSING:{}", folder.display()))
        }
        Err(err) => Err(err.to_string()),
    }
}

/// Permanently removes everything currently inside the designated Trash
/// folder — the Binder context menu's "Empty Trash" item, shown only on a
/// folder currently holding the Trash role.
#[tauri::command]
pub fn empty_trash(root: String) -> Result<BinderNodeDto, String> {
    let mut project = load(&root)?;
    project.empty_trash().map_err(|e| e.to_string())?;
    Ok(build_tree(&project))
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
        tree: build_tree(&project),
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
        tree: build_tree(&project),
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
    tree: BinderNodeDto,
}

#[tauri::command]
pub fn open_daily_note(root: String) -> Result<DailyNoteResult, String> {
    let mut project = load(&root)?;
    if !project.daily_notes_enabled() {
        return Err("Daily Notes is off — enable it in Project Settings > Daily Notes".to_string());
    }
    let settings = global_settings();
    let (path, cursor) = project
        .open_or_create_daily_note(
            &settings.template_date_format,
            &settings.template_time_format,
        )
        .map_err(|e| e.to_string())?;
    // `open_or_create_daily_note` already rescans internally (via
    // `write_new_document`/`create_document_from_template_with_formats`)
    // when it actually creates something, so the binder tree here is
    // already current — this just needs to hand it back, the same way
    // every other binder-mutating command does, so the frontend doesn't
    // show a freshly-created note (and, the first time, a freshly-created
    // Daily Notes folder) missing from the Binder until something else
    // happens to refresh it.
    Ok(DailyNoteResult {
        path: path.display().to_string(),
        cursor,
        tree: build_tree(&project),
    })
}

#[derive(Serialize)]
pub struct BinderColorModeResult {
    binder_color_mode: BinderColorMode,
    tree: BinderNodeDto,
}

/// Advance the binder's row-coloring mode to the next one in
/// `BinderColorMode::next`'s cycle (Off → Status → Pov → WordCountProgress →
/// Off) and return the tree recolored under it.
#[tauri::command]
pub fn cycle_binder_color_mode(root: String) -> Result<BinderColorModeResult, String> {
    let mut project = load(&root)?;
    let next = project.meta.binder_color_mode.next();
    project
        .set_binder_color_mode(next)
        .map_err(|e| e.to_string())?;
    Ok(BinderColorModeResult {
        binder_color_mode: next,
        tree: build_tree(&project),
    })
}

/// The Project Settings dialog's Binder tab — same shape as
/// `cycle_binder_color_mode` but setting a specific mode directly (a radio
/// button, not a cycle-through-them-all button).
#[tauri::command]
pub fn set_binder_color_mode(
    root: String,
    mode: BinderColorMode,
) -> Result<BinderColorModeResult, String> {
    let mut project = load(&root)?;
    project
        .set_binder_color_mode(mode)
        .map_err(|e| e.to_string())?;
    Ok(BinderColorModeResult {
        binder_color_mode: mode,
        tree: build_tree(&project),
    })
}
