import { invoke } from "@tauri-apps/api/core";
import { dockLayoutRegistry } from "./dockLayoutRegistry.svelte";
import { showToast } from "./toast.svelte";
import { settingsStore } from "./settings.svelte";

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
  | { kind: "Folder"; name: string; path: string; color: string | null; children: BinderNodeDto[] }
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
};

export const project = $state<{
  value: ProjectSummary | null;
  openError: string | null;
  selectedPath: string | null;
  documentText: string;
  documentError: string | null;
  saveStatus: "idle" | "saving" | "saved" | "error";
  previewHtml: string;
}>({
  value: null,
  openError: null,
  selectedPath: null,
  documentText: "",
  documentError: null,
  saveStatus: "idle",
  previewHtml: "",
});

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let previewTimer: ReturnType<typeof setTimeout> | undefined;
let editorRef:
  | {
      setDocument: (text: string) => void;
      openFindReplace: () => void;
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

export function openFindReplace() {
  editorRef?.openFindReplace();
}

export async function openProject(root: string) {
  project.openError = null;
  project.value = null;
  project.selectedPath = null;
  project.documentText = "";
  project.previewHtml = "";
  try {
    project.value = await invoke<ProjectSummary>("project_open", { root });
  } catch (err) {
    project.openError = String(err);
  }
}

export async function createProject(root: string) {
  project.openError = null;
  project.value = null;
  project.selectedPath = null;
  project.documentText = "";
  project.previewHtml = "";
  try {
    project.value = await invoke<ProjectSummary>("project_create", { root });
  } catch (err) {
    project.openError = String(err);
  }
}

export async function closeProject() {
  await invoke("project_close");
  project.value = null;
  project.selectedPath = null;
  project.documentText = "";
  project.previewHtml = "";
}

export async function openDocument(path: string) {
  flushPendingSave();
  project.documentError = null;
  project.saveStatus = "idle";
  try {
    const text = await invoke<string>("document_read", { path });
    project.documentText = text;
    project.selectedPath = path;
    editorRef?.setDocument(text);
    schedulePreview();
    scheduleSpellCheck();
    pushRecentFile(path);
    pushHistory(path);
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
    await invoke("document_save", {
      path: project.selectedPath,
      contents: project.documentText,
    });
    project.saveStatus = "saved";
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

/** Backs the Exit shortcut — awaits the save rather than firing it off like
 * `flushPendingSave` does, so the window doesn't close mid-write. This
 * port's autosave (an 800ms debounce after every keystroke, not an
 * explicit-save/dirty-tab model) makes the real app's whole "unsaved
 * changes?" confirm-on-exit modal unnecessary: the realistic gap is just
 * whatever's still sitting in that debounce, which this closes. */
export async function flushBeforeExit() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    await saveDocument();
  }
}

export function onTreeChange(tree: BinderNodeDto) {
  if (project.value) project.value.tree = tree;
}

export function closeDocument() {
  flushPendingSave();
  project.selectedPath = null;
  project.documentText = "";
  project.previewHtml = "";
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

export async function newDocumentAtSelection() {
  if (!project.value) return;
  const name = window.prompt("New document name:", "Untitled");
  if (!name) return;
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

export async function newFolderAtSelection() {
  if (!project.value) return;
  const name = window.prompt("New folder name:", "New Folder");
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
  const newName = window.prompt("Rename to:", currentName);
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

export async function deleteSelection() {
  if (!project.value || !project.selectedPath) return;
  const path = project.selectedPath;
  const name = path.split("/").pop()!.replace(/\.md$/, "");
  try {
    const toTrash = await invoke<boolean>("deletes_to_trash", { root: project.value.root, path });
    const confirmed = window.confirm(
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
    if (missing && window.confirm(`"${missing[1]}" no longer exists. Recreate it and restore here?`)) {
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
  dockLayoutRegistry.api?.openPanel("editor");
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
    const result = await invoke<{ path: string; cursor: number | null }>("open_daily_note", {
      root: project.value.root,
    });
    await openDocument(result.path);
  } catch (err) {
    showToast(String(err));
  }
}
