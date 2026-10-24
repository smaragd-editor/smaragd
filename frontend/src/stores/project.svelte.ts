import { invoke } from "@tauri-apps/api/core";
import { dockLayoutRegistry } from "./dockLayoutRegistry.svelte";
import { showToast } from "./toast.svelte";
import { settingsStore, saveSettingsDebounced } from "./settings.svelte";
import { showPrompt, showConfirm } from "./promptDialog.svelte";
import { resetMetadataSelectionToDocument } from "./metadataSelection.svelte";

// Phase 5: lifted out of ProjectView.svelte so every dock panel (Binder,
// Editor, Preview, Corkboard, Story Grid) can read/mutate the same project
// state regardless of which dockview group it's mounted in — a dockview
// panel's content is mounted into a plain detached <div> via Svelte's
// imperative mount(), outside the normal component tree, so passing state
// down through props/context from a single parent no longer works once
// panels can be freely split, floated, and closed/reopened independently.
//
// Fields live on one exported `$state` object rather than as separate
// top-level exports: Svelte 5 forbids reassigning an exported `$state`
// binding directly (`state_invalid_export`) since that can't be represented
// safely across a module boundary — only mutating an exported state value's
// *properties* is allowed, which this shape gives every field.
export type DocumentStats = { lines: number; words: number; chars: number };

export type BinderNodeDto =
  | {
      kind: "Folder";
      name: string;
      path: string;
      color: string | null;
      role: FolderRole | null;
      children: BinderNodeDto[];
    }
  | {
      kind: "Document";
      name: string;
      path: string;
      color: string | null;
      stats: DocumentStats | null;
    };

export type BinderColorMode = "Off" | "Status" | "Pov" | "WordCountProgress";

export type FolderRole = "Research" | "Trash" | "Templates" | "Manuscript" | "World";

export type ProjectSummary = {
  root: string;
  book_title: string | null;
  binder_color_mode: BinderColorMode;
  tree: BinderNodeDto;
  sanity_check_issues: string[];
};

export const project = $state<{
  value: ProjectSummary | null;
  openError: string | null;
  selectedPath: string | null;
  documentText: string;
  documentError: string | null;
  saveStatus: "idle" | "saving" | "saved" | "error";
  previewHtml: string;
  /** True from the first edit after an open/save/external-reload until the
   * next successful save — the Tauri-port equivalent of the real app's
   * `EditorState::dirty`, kept only so `checkOpenDocumentForExternalChange`
   * can tell "safe to silently reload" apart from "would clobber an
   * unsaved edit" the same way `check_open_document_for_external_change`
   * does, despite this port having no held multi-tab editor state. */
  dirty: boolean;
}>({
  value: null,
  openError: null,
  selectedPath: null,
  documentText: "",
  documentError: null,
  saveStatus: "idle",
  previewHtml: "",
  dirty: false,
});

/** Set when the open document changed on disk while `project.dirty` was
 * true — `app::external_watch`'s `external_conflict`, ported 1:1 as a
 * promise-free reactive flag instead, since ExternalConflictPrompt.svelte
 * just reads it directly rather than awaiting a resolution. */
export const externalConflict = $state<{ path: string | null }>({ path: null });

/** `project::sanity_check::check`'s findings from the project that's open
 * right now, shown once by SanityCheckPrompt.svelte then cleared on
 * dismissal (`dismissSanityCheck`) — ports `SmaragdApp::sanity_check_issues`
 * 1:1, set alongside `project.value` instead of living on it directly so
 * dismissing it doesn't need to touch `ProjectSummary` itself. */
export const sanityCheckIssues = $state<{ items: string[] }>({ items: [] });

export function dismissSanityCheck() {
  sanityCheckIssues.items = [];
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let previewTimer: ReturnType<typeof setTimeout> | undefined;
let lastKnownMtimeMs: number | null = null;
let externalWatchTimer: ReturnType<typeof setInterval> | undefined;
let editorRef:
  | {
      setDocument: (text: string) => void;
      openFindReplace: (prefill?: string) => void;
      gotoLine: (line: number) => void;
      setMisspellings: (ranges: { from: number; to: number }[]) => void;
    }
  | undefined;

/** Called by EditorPanel.svelte on mount/unmount. A panel reopened from the
 * Window menu (or moved to a new group, which remounts its content) needs
 * today's already-open document echoed back into it immediately, since it
 * missed whatever `openDocument` call originally populated `documentText`. */
export function registerEditor(ref: typeof editorRef) {
  editorRef = ref;
  if (editorRef && project.selectedPath) {
    editorRef.setDocument(project.documentText);
    scheduleSpellCheck();
  }
}

export function openFindReplace(prefill?: string) {
  editorRef?.openFindReplace(prefill);
}

let binderRef: { focusSelectedOrTop: () => void } | undefined;

/** Called by BinderTree.svelte on mount/unmount, same pattern as
 * `registerEditor`. */
export function registerBinder(ref: typeof binderRef) {
  binderRef = ref;
}

/** Ports `binder_panel.rs`'s `focus_requested` handling: focuses the
 * currently open document's row if it's visible (not hidden inside a
 * collapsed folder), or the project root's own row otherwise — called by
 * DockLayout.svelte right after the Binder panel transitions from
 * not-visible to visible (toggled on, or brought to front), matching the
 * real app's own tab-to-front-plus-focus-request combo
 * (`ToggleBinderFocus`/"Reveal in Binder"). A no-op if the Binder isn't
 * actually mounted (e.g. called before DockLayout exists yet). */
export function focusBinder() {
  binderRef?.focusSelectedOrTop();
}

// Mirrors core::settings::Settings::record_recent_project exactly (most-
// recent-first, de-duplicated, capped) — done here rather than as a Tauri
// command since settingsStore is already loaded client-side and every
// other settings mutation already goes through this same mutate-then-
// saveSettingsDebounced pattern.
const MAX_RECENT_PROJECTS = 10;

function recordRecentProject(root: string) {
  settingsStore.value.last_project_path = root;
  settingsStore.value.recent_project_paths = [
    root,
    ...settingsStore.value.recent_project_paths.filter((p) => p !== root),
  ].slice(0, MAX_RECENT_PROJECTS);
  settingsStore.value = { ...settingsStore.value };
  saveSettingsDebounced();
}

// Scrivener-style zipped backups (core::backup, app::backup::run_backup):
// "open"/"close"/"manual_save" map to the Settings > Versions toggles of
// the same name. A no-op (not a toast) when disabled; a failure shows as
// an error toast but never blocks whatever the caller was already doing.
type BackupOutcome = { kind: "Skipped" } | { kind: "BackedUp" } | { kind: "Failed"; message: string };

async function runBackup(root: string, trigger: "open" | "close" | "manual_save") {
  const outcome = await invoke<BackupOutcome>("backup_run", { root, trigger });
  if (outcome.kind === "BackedUp") showToast("Backed up project");
  else if (outcome.kind === "Failed") showToast(outcome.message);
}

export async function openProject(root: string) {
  project.openError = null;
  project.value = null;
  project.selectedPath = null;
  project.documentText = "";
  project.previewHtml = "";
  try {
    project.value = await invoke<ProjectSummary>("project_open", { root });
    recordRecentProject(root);
    sanityCheckIssues.items = project.value.sanity_check_issues;
    await runBackup(root, "open");
    startExternalWatch();
  } catch (err) {
    project.openError = String(err);
  }
}

export async function createProjectFromTemplate(root: string, templateId: string) {
  project.openError = null;
  project.value = null;
  project.selectedPath = null;
  project.documentText = "";
  project.previewHtml = "";
  try {
    project.value = await invoke<ProjectSummary>("project_create_from_template", {
      root,
      templateId,
    });
    recordRecentProject(root);
    sanityCheckIssues.items = project.value.sanity_check_issues;
    await runBackup(root, "open");
    startExternalWatch();
  } catch (err) {
    project.openError = String(err);
  }
}

export async function closeProject() {
  const root = project.value?.root;
  stopExternalWatch();
  await invoke("project_close");
  if (root) await runBackup(root, "close");
  project.value = null;
  project.selectedPath = null;
  project.documentText = "";
  project.previewHtml = "";
  dismissSanityCheck();
}

// External-change detection (app::external_watch): another program, a sync
// tool, or a manual `git pull` outside this app's own Versions menu can
// change files on disk while the project is open. Polled rather than
// filesystem-event-driven, same interval as the real app's own
// EXTERNAL_SCAN_INTERVAL — short enough that a change shows up promptly,
// long enough to be a non-event for CPU. A no-op (not an error) if the
// scan or mtime check itself fails (e.g. the file briefly doesn't exist
// mid-write) — just tries again next tick, same tolerance the real app's
// own 2-second poll has.
const EXTERNAL_SCAN_INTERVAL_MS = 2000;

function startExternalWatch() {
  stopExternalWatch();
  externalWatchTimer = setInterval(checkExternalChanges, EXTERNAL_SCAN_INTERVAL_MS);
}

function stopExternalWatch() {
  clearInterval(externalWatchTimer);
  externalWatchTimer = undefined;
}

async function checkExternalChanges() {
  if (!project.value) return;
  try {
    const tree = await invoke<BinderNodeDto>("project_binder_tree", { root: project.value.root });
    onTreeChange(tree);
  } catch {
    // A transient scan failure shouldn't surface as an error toast —
    // just try again next tick.
  }
  await checkOpenDocumentForExternalChange();
}

/** If the open document's on-disk content moved since it was last read or
 * written here: reload it immediately when there's nothing unsaved to
 * lose, or — if `project.dirty` — leave the buffer alone and record the
 * conflict for ExternalConflictPrompt.svelte to ask the user about instead
 * of silently clobbering either version. Leaves an already-recorded
 * conflict alone rather than re-detecting it every scan. Ports
 * `check_open_document_for_external_change` 1:1. */
async function checkOpenDocumentForExternalChange() {
  if (!project.selectedPath || lastKnownMtimeMs === null || externalConflict.path !== null) return;
  let mtime: number;
  try {
    mtime = await invoke<number>("document_mtime", { path: project.selectedPath });
  } catch {
    return;
  }
  if (mtime <= lastKnownMtimeMs) return;
  if (project.dirty) {
    externalConflict.path = project.selectedPath;
    return;
  }
  const path = project.selectedPath;
  try {
    const text = await invoke<string>("document_read", { path });
    project.documentText = text;
    editorRef?.setDocument(text);
    lastKnownMtimeMs = mtime;
    schedulePreview();
    scheduleSpellCheck();
    const name = path.split("/").pop()?.replace(/\.md$/, "") ?? "Document";
    showToast(`Reloaded "${name}" — changed on disk`);
  } catch (err) {
    showToast(`Couldn't reload ${path}: ${err}`);
  }
}

/** Resolve `externalConflict` per the user's choice in
 * ExternalConflictPrompt.svelte: `discardLocal` reloads the on-disk
 * version (losing the unsaved edits), otherwise the local buffer is kept
 * and the on-disk change is just acknowledged so the same write isn't
 * flagged again. Ports `resolve_external_conflict` 1:1. */
export async function resolveExternalConflict(discardLocal: boolean) {
  const path = externalConflict.path;
  externalConflict.path = null;
  if (!path) return;
  if (discardLocal) {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    try {
      const text = await invoke<string>("document_read", { path });
      project.documentText = text;
      editorRef?.setDocument(text);
      project.dirty = false;
      project.saveStatus = "saved";
      lastKnownMtimeMs = await invoke<number>("document_mtime", { path });
      schedulePreview();
      scheduleSpellCheck();
      showToast("Reloaded from disk");
    } catch (err) {
      showToast(`Couldn't reload: ${err}`);
    }
  } else {
    try {
      lastKnownMtimeMs = await invoke<number>("document_mtime", { path });
    } catch {
      // Leaves lastKnownMtimeMs as-is — worst case this re-raises the same
      // conflict next scan, which is safe, just an extra prompt.
    }
  }
}

export async function openDocument(path: string) {
  flushPendingSave();
  project.documentError = null;
  project.saveStatus = "idle";
  project.dirty = false;
  externalConflict.path = null;
  lastKnownMtimeMs = null;
  try {
    const text = await invoke<string>("document_read", { path });
    project.documentText = text;
    project.selectedPath = path;
    resetMetadataSelectionToDocument();
    editorRef?.setDocument(text);
    schedulePreview();
    scheduleSpellCheck();
    pushRecentFile(path);
    pushHistory(path);
    try {
      lastKnownMtimeMs = await invoke<number>("document_mtime", { path });
    } catch {
      // No mtime to compare against yet — external-change detection for
      // this document just stays inert until the next open/save.
    }
  } catch (err) {
    project.documentError = String(err);
  }
}

// Go Back/Forward + Recent Files: a plain in-memory browser-style history
// and a most-recently-opened list, both client-side only — the real app's
// equivalent (`core::editor::EditorState`) is a full server-held multi-tab
// model (open/save/close tabs, dirty tracking, cursor position) that this
// port's intentionally-stateless, tab-less document model (just
// `selectedPath`/`documentText` above) doesn't have a slot for. Reusing it
// faithfully would mean introducing session state in the Tauri backend; this
// gives the same two behaviors (step back/forward, reopen something recent)
// without that architectural change.
const MAX_HISTORY = 50;
const MAX_RECENT_FILES = 20;
let history: string[] = [];
let historyIndex = -1;
let navigatingHistory = false;
let recentFiles: string[] = [];

function pushHistory(path: string) {
  if (navigatingHistory || history[historyIndex] === path) return;
  history = [...history.slice(0, historyIndex + 1), path].slice(-MAX_HISTORY);
  historyIndex = history.length - 1;
}

function pushRecentFile(path: string) {
  recentFiles = [path, ...recentFiles.filter((p) => p !== path)].slice(0, MAX_RECENT_FILES);
}

/** A snapshot, not a reactive store — RecentFiles.svelte reads this once
 * when it opens rather than subscribing, since the list only changes on
 * document open (which closes any such palette anyway). */
export function recentlyOpenedPaths(): string[] {
  return recentFiles;
}

export async function goBackDocument() {
  if (historyIndex <= 0) {
    showToast("Nothing to go back to");
    return;
  }
  historyIndex -= 1;
  navigatingHistory = true;
  await openDocument(history[historyIndex]);
  navigatingHistory = false;
}

export async function goForwardDocument() {
  if (historyIndex >= history.length - 1) {
    showToast("Nothing to go forward to");
    return;
  }
  historyIndex += 1;
  navigatingHistory = true;
  await openDocument(history[historyIndex]);
  navigatingHistory = false;
}

export function onEditorChange(text: string) {
  project.documentText = text;
  project.saveStatus = "idle";
  project.dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDocument, 800);
  schedulePreview();
  scheduleSpellCheck();
}

/** MetadataPanel.svelte's entry point for a metadata edit: `newContents` is
 * the whole document with its frontmatter block already folded in (from
 * `frontmatter_write_back`, pure text-in/text-out same as `render_markdown`
 * — the Tauri-port equivalent of the real app's `apply_metadata_edits_if_changed`,
 * which mutates the live editor buffer directly rather than writing straight
 * to disk). Unlike `onEditorChange` (driven by CodeMirror's own keystroke,
 * which has already updated what's on screen before this would run), this
 * change originates *outside* the editor, so it also has to push the new
 * text into the live view itself — everything after that is identical:
 * same debounced autosave/preview/spell-check pipeline a body edit goes
 * through. */
export function applyDocumentMetaEdit(newContents: string) {
  project.documentText = newContents;
  editorRef?.setDocument(newContents);
  project.saveStatus = "idle";
  project.dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDocument, 800);
  schedulePreview();
  scheduleSpellCheck();
}

function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(async () => {
    project.previewHtml = await invoke<string>("render_markdown", {
      markdown: project.documentText,
    });
  }, 300);
}

let spellCheckTimer: ReturnType<typeof setTimeout> | undefined;

/** Converts the backend's UTF-8 byte-offset spans (Rust string indexing) to
 * UTF-16 code-unit offsets (CodeMirror/JS string indexing) — identical for
 * plain ASCII text, but genuinely different for non-ASCII (this app ships
 * Norwegian dictionaries; æøå alone would otherwise misplace every
 * underline after the first one on a line). One pass to build a lookup,
 * not one `TextEncoder` call per character. */
function byteSpansToUtf16(text: string, spans: [number, number][]): { from: number; to: number }[] {
  if (spans.length === 0) return [];
  const encoder = new TextEncoder();
  const byteOffsets: number[] = [0];
  const utf16Offsets: number[] = [0];
  let byteLen = 0;
  let utf16Len = 0;
  for (const ch of text) {
    byteLen += encoder.encode(ch).length;
    utf16Len += ch.length;
    byteOffsets.push(byteLen);
    utf16Offsets.push(utf16Len);
  }
  const toUtf16 = (byteOffset: number): number => {
    let lo = 0;
    let hi = byteOffsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (byteOffsets[mid] < byteOffset) lo = mid + 1;
      else hi = mid;
    }
    return utf16Offsets[lo];
  };
  return spans.map(([start, end]) => ({ from: toUtf16(start), to: toUtf16(end) }));
}

function scheduleSpellCheck() {
  clearTimeout(spellCheckTimer);
  const language = settingsStore.value.spell_check_language;
  if (language === "Off") {
    editorRef?.setMisspellings([]);
    return;
  }
  spellCheckTimer = setTimeout(async () => {
    try {
      const text = project.documentText;
      const spans = await invoke<[number, number][]>("spell_check_misspellings", { text, language });
      editorRef?.setMisspellings(byteSpansToUtf16(text, spans));
    } catch {
      // Spell check is a non-essential overlay — leave whatever
      // decorations were already showing rather than surface an error.
    }
  }, 400);
}

/** Re-runs spell check against the currently open document — called after
 * the active language changes (SettingsDialog, the toggle shortcut), since
 * nothing else would otherwise trigger a recompute until the next edit. */
export function recheckSpelling() {
  scheduleSpellCheck();
}

export async function saveDocument() {
  if (!project.selectedPath) return;
  project.saveStatus = "saving";
  try {
    lastKnownMtimeMs = await invoke<number>("document_save", {
      path: project.selectedPath,
      contents: project.documentText,
    });
    project.saveStatus = "saved";
    project.dirty = false;
  } catch (err) {
    project.documentError = String(err);
    project.saveStatus = "error";
  }
}

function flushPendingSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    saveDocument();
  }
}

/** Backs the Save shortcut (Ctrl+S) specifically — the one explicit "manual
 * save" moment this port's otherwise-autosave-only model has, and the only
 * call site that should trip the `backup_on_manual_save` trigger; the
 * debounce timer and `flushPendingSave`/`flushBeforeExit` below call
 * `saveDocument` directly so plain autosave never does. */
export async function manualSaveDocument() {
  await saveDocument();
  if (project.value) await runBackup(project.value.root, "manual_save");
}

/** Backs the Exit shortcut — awaits the save rather than firing it off like
 * `flushPendingSave` does, so the window doesn't close mid-write. This
 * port's autosave (an 800ms debounce after every keystroke, not an
 * explicit-save/dirty-tab model) makes the real app's whole "unsaved
 * changes?" confirm-on-exit modal unnecessary: the realistic gap is just
 * whatever's still sitting in that debounce, which this closes. Also runs
 * the "close" backup trigger, matching `close_project`'s own call to
 * `run_backup(BackupTrigger::Close)` right before the real app exits. */
export async function flushBeforeExit() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    await saveDocument();
  }
  if (project.value) await runBackup(project.value.root, "close");
}

export function onTreeChange(tree: BinderNodeDto) {
  if (project.value) project.value.tree = tree;
}

export function closeDocument() {
  flushPendingSave();
  project.selectedPath = null;
  project.documentText = "";
  project.previewHtml = "";
  project.dirty = false;
  externalConflict.path = null;
  lastKnownMtimeMs = null;
  editorRef?.setMisspellings([]);
}

/** The folder a shortcut-triggered New File/New Folder should create inside:
 * the currently open document's own folder, or the project root if nothing
 * is open — mirrors the real egui app's "act on selected_path" semantics
 * (app/src/app/mod.rs), simplified since this port's `selectedPath` only
 * ever names an open document, never a selected folder. */
function currentFolder(): string {
  if (!project.value) return "";
  if (!project.selectedPath) return project.value.root;
  const idx = project.selectedPath.lastIndexOf("/");
  return idx >= 0 ? project.selectedPath.slice(0, idx) : project.value.root;
}

/** Shared by newDocumentAtSelection (prompts for the name first) and the
 * `:new <title>` command prompt command (gets it as the command's argument
 * instead) — both create at currentFolder() and open the result. */
export async function createDocumentAtSelection(name: string) {
  if (!project.value) return;
  try {
    const result = await invoke<{ tree: BinderNodeDto; path: string }>("binder_create_document", {
      root: project.value.root,
      parent: currentFolder(),
      name,
    });
    onTreeChange(result.tree);
    openDocument(result.path);
  } catch (err) {
    showToast(`Couldn't create document: ${err}`);
  }
}

export async function newDocumentAtSelection() {
  if (!project.value) return;
  const name = await showPrompt("New document name:", "Untitled");
  if (!name) return;
  await createDocumentAtSelection(name);
}

export async function newFolderAtSelection() {
  if (!project.value) return;
  const name = await showPrompt("New folder name:", "New Folder");
  if (!name) return;
  try {
    const tree = await invoke<BinderNodeDto>("binder_create_folder", {
      root: project.value.root,
      parent: currentFolder(),
      name,
    });
    onTreeChange(tree);
  } catch (err) {
    showToast(`Couldn't create folder: ${err}`);
  }
}

export async function renameSelection() {
  if (!project.value || !project.selectedPath) return;
  const currentName = project.selectedPath.split("/").pop()!.replace(/\.md$/, "");
  const newName = await showPrompt("Rename to:", currentName);
  if (!newName || newName === currentName) return;
  try {
    const result = await invoke<{ tree: BinderNodeDto; path: string }>("binder_rename", {
      root: project.value.root,
      path: project.selectedPath,
      newName,
    });
    recordRename(project.selectedPath, result.path);
    onTreeChange(result.tree);
    project.selectedPath = result.path;
  } catch (err) {
    showToast(`Couldn't rename: ${err}`);
  }
}

/** Backs the Editor pane's ☰ menu's "Move file to…" — same prompt-based
 * folder-path move BinderTree.svelte's own "Move" button uses, just acting
 * on the currently open document rather than an explicit path. */
export async function moveSelectionTo() {
  if (!project.value || !project.selectedPath) return;
  const path = project.selectedPath;
  const name = path.split("/").pop()!.replace(/\.md$/, "");
  const destination = await showPrompt(`Move "${name}" to (absolute folder path):`, project.value.root);
  if (!destination) return;
  try {
    const result = await invoke<{ tree: BinderNodeDto; path: string }>("binder_move", {
      root: project.value.root,
      path,
      newParent: destination,
    });
    recordMove(path, result.path);
    onTreeChange(result.tree);
    project.selectedPath = result.path;
  } catch (err) {
    showToast(`Couldn't move: ${err}`);
  }
}

export async function deleteSelection() {
  if (!project.value || !project.selectedPath) return;
  const path = project.selectedPath;
  const name = path.split("/").pop()!.replace(/\.md$/, "");
  try {
    const toTrash = await invoke<boolean>("deletes_to_trash", { root: project.value.root, path });
    const confirmed = await showConfirm(
      toTrash ? `Move "${name}" to Trash?` : `Delete "${name}"? This cannot be undone.`,
    );
    if (!confirmed) return;
    const tree = await invoke<BinderNodeDto>("binder_delete", { root: project.value.root, path });
    onTreeChange(tree);
    closeDocument();
  } catch (err) {
    showToast(`Couldn't delete: ${err}`);
  }
}

export async function restorePath(path: string, recreate = false) {
  if (!project.value) return;
  try {
    const result = await invoke<{ tree: BinderNodeDto; path: string }>("binder_restore", {
      root: project.value.root,
      path,
      recreate,
    });
    onTreeChange(result.tree);
    showToast("Restored");
  } catch (err) {
    const missing = /^ORIGINAL_FOLDER_MISSING:(.*)$/.exec(String(err));
    if (missing && (await showConfirm(`"${missing[1]}" no longer exists. Recreate it and restore here?`))) {
      await restorePath(path, true);
    } else if (!missing) {
      showToast(`Couldn't restore: ${err}`);
    }
  }
}

export async function restoreSelection() {
  if (!project.selectedPath) return;
  await restorePath(project.selectedPath);
}

/** The single most recent binder rename/move, kept so `undoLastStructuralOp`
 * can reverse it — a single-level undo, same shape as the real egui app's
 * `structural_undo.rs`: undoing a second time redoes it rather than no-op'ing,
 * since reversing re-records the swapped op as the new "last" one. */
type StructuralOp = { kind: "renamed" | "moved"; from: string; to: string };
let lastStructuralOp: StructuralOp | undefined;

export function recordRename(from: string, to: string) {
  lastStructuralOp = { kind: "renamed", from, to };
}

export function recordMove(from: string, to: string) {
  lastStructuralOp = { kind: "moved", from, to };
}

export async function undoLastStructuralOp() {
  const op = lastStructuralOp;
  if (!op || !project.value) {
    showToast("Nothing to undo");
    return;
  }
  const root = project.value.root;
  try {
    if (op.kind === "renamed") {
      const oldName = op.from.split("/").pop()!.replace(/\.md$/, "");
      const result = await invoke<{ tree: BinderNodeDto; path: string }>("binder_rename", {
        root,
        path: op.to,
        newName: oldName,
      });
      onTreeChange(result.tree);
      if (project.selectedPath === op.to) project.selectedPath = result.path;
      lastStructuralOp = { kind: "renamed", from: op.to, to: result.path };
    } else {
      const oldParent = op.from.slice(0, op.from.lastIndexOf("/")) || root;
      const result = await invoke<{ tree: BinderNodeDto; path: string }>("binder_move", {
        root,
        path: op.to,
        newParent: oldParent,
      });
      onTreeChange(result.tree);
      if (project.selectedPath === op.to) project.selectedPath = result.path;
      lastStructuralOp = { kind: "moved", from: op.to, to: result.path };
    }
    showToast("Undone");
  } catch (err) {
    showToast(`Couldn't undo: ${err}`);
  }
}

export async function gotoDocumentLine(path: string, line: number) {
  if (project.selectedPath !== path) await openDocument(path);
  // ensurePanelOpen, not openPanel: the latter toggles, which would close
  // the Editor tab instead of focusing it whenever it was already the
  // active tab — the common case, since it's in the default layout.
  dockLayoutRegistry.api?.ensurePanelOpen("editor");
  editorRef?.gotoLine(line);
}

type Bookmark = { id: string; path: string; line: number; document_stem: string | null };

export async function cycleBookmark(direction: 1 | -1) {
  if (!project.value) return;
  try {
    const bookmarks = await invoke<Bookmark[]>("bookmarks_list", { root: project.value.root });
    if (bookmarks.length === 0) {
      showToast("No bookmarks");
      return;
    }
    const current = bookmarks.findIndex((b) => b.path === project.selectedPath);
    const next =
      current === -1
        ? direction === 1
          ? 0
          : bookmarks.length - 1
        : (current + direction + bookmarks.length) % bookmarks.length;
    await gotoDocumentLine(bookmarks[next].path, bookmarks[next].line);
  } catch (err) {
    showToast(String(err));
  }
}

type Note = {
  id: string;
  path: string;
  line: number;
  column: number;
  text: string;
  document_stem: string | null;
};

export async function cycleNote(direction: 1 | -1) {
  if (!project.value) return;
  try {
    const notes = await invoke<Note[]>("notes_list", { root: project.value.root });
    if (notes.length === 0) {
      showToast("No notes");
      return;
    }
    const current = notes.findIndex((n) => n.path === project.selectedPath);
    const next =
      current === -1
        ? direction === 1
          ? 0
          : notes.length - 1
        : (current + direction + notes.length) % notes.length;
    await gotoDocumentLine(notes[next].path, notes[next].line);
  } catch (err) {
    showToast(String(err));
  }
}

export async function cycleBinderColorMode() {
  if (!project.value) return;
  try {
    const result = await invoke<{ binder_color_mode: BinderColorMode; tree: BinderNodeDto }>(
      "cycle_binder_color_mode",
      { root: project.value.root },
    );
    project.value.binder_color_mode = result.binder_color_mode;
    onTreeChange(result.tree);
    showToast(`Binder color: ${result.binder_color_mode}`);
  } catch (err) {
    showToast(String(err));
  }
}

export async function openDailyNote() {
  if (!project.value) {
    showToast("No project open");
    return;
  }
  try {
    const result = await invoke<{ path: string; cursor: number | null; tree: BinderNodeDto }>(
      "open_daily_note",
      { root: project.value.root },
    );
    // A freshly-created note (and, the first time, a freshly-created Daily
    // Notes folder) otherwise doesn't show up in the Binder until
    // something else happens to refresh it.
    onTreeChange(result.tree);
    await openDocument(result.path);
    // ensurePanelOpen, not openPanel: the latter toggles, which would
    // close the Editor tab instead of focusing it whenever it was already
    // the active tab.
    dockLayoutRegistry.api?.ensurePanelOpen("editor");
    editorRef?.gotoLine(1);
  } catch (err) {
    showToast(String(err));
  }
}
