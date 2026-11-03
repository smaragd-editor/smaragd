import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { KeyCombo, SpellCheckLanguage } from "./stores/settings.svelte";
import { settingsStore, saveSettingsDebounced } from "./stores/settings.svelte";
import { dockLayoutRegistry } from "./stores/dockLayoutRegistry.svelte";
import { wordCountRegistry } from "./stores/wordCountRegistry.svelte";
import { notImplemented } from "./stores/toast.svelte";
import { zoomInPreview, zoomOutPreview, resetPreviewZoom } from "./stores/previewZoom.svelte";
import { toggleEditorViewMode } from "./stores/editorViewMode.svelte";
import { toggleInlineBacklinks } from "./stores/inlineBacklinks.svelte";
import { toggleDarkMode } from "./stores/theme.svelte";
import { toggleFocusMode } from "./stores/focusMode.svelte";
import {
  project,
  manualSaveDocument,
  closeDocument,
  newDocumentAtSelection,
  newFolderAtSelection,
  renameSelection,
  deleteSelection,
  restoreSelection,
  undoLastStructuralOp,
  cycleBookmark,
  cycleNote,
  openDailyNote,
  cycleBinderColorMode,
  goBackDocument,
  goForwardDocument,
  flushBeforeExit,
  recheckSpelling,
  runPluginCommand,
} from "./stores/project.svelte";

// Port of the real egui app's ShortcutAction system (app/src/shortcuts.rs,
// 63 variants) — same action ids/labels/categories/default bindings, kept
// as the frontend's own catalog (not round-tripped through Rust) since
// dispatch has to run client-side for responsiveness: a Tauri IPC round
// trip per keystroke would be the thing the whole push-event architecture
// (Phase 6) exists to avoid. Only the *bindings* (which combo each action
// is mapped to) are persisted, via core::settings::Settings.shortcuts.
export type ShortcutCategory =
  | "Application"
  | "Project"
  | "FilesAndFolders"
  | "Editing"
  | "View"
  | "Git"
  | "Tools";

export type ShortcutActionDef = {
  id: string;
  label: string;
  category: ShortcutCategory;
  default: KeyCombo;
  /** An editor-cursor-local action (wikilink-follow, toggle-bookmark,
   * add-note-at-cursor) — needs CodeMirror's own cursor, which only
   * MarkdownEditor.svelte has, so it's consumed there via its own keymap
   * (see `inlineShortcutsKeymap`) instead of this file's global
   * `handleGlobalKeydown`. Still real data here: `effectiveCombo` resolves
   * its binding the same way as any other action (Settings remapping,
   * conflict protection against global actions with an overlapping,
   * less-specific combo), MarkdownEditor.svelte just reads it directly
   * rather than being dispatched through `handleGlobalKeydown`. */
  inlineConsumed?: boolean;
};

const cmd = (key: string): KeyCombo => ({ key, ctrl_or_cmd: true, shift: false, alt: false });
const cmdShift = (key: string): KeyCombo => ({ key, ctrl_or_cmd: true, shift: true, alt: false });
const cmdAlt = (key: string): KeyCombo => ({ key, ctrl_or_cmd: true, shift: false, alt: true });
const cmdAltShift = (key: string): KeyCombo => ({ key, ctrl_or_cmd: true, shift: true, alt: true });
const altOnly = (key: string): KeyCombo => ({ key, ctrl_or_cmd: false, shift: false, alt: true });
const bare = (key: string): KeyCombo => ({ key, ctrl_or_cmd: false, shift: false, alt: false });
const shiftOnly = (key: string): KeyCombo => ({ key, ctrl_or_cmd: false, shift: true, alt: false });

// prettier-ignore
export const SHORTCUT_ACTIONS: ShortcutActionDef[] = [
  { id: "new_project", label: "New Project", category: "Project", default: cmdAlt("n") },
  { id: "open_project", label: "Open Project", category: "Project", default: cmd("o") },
  { id: "close_project", label: "Close Project", category: "Project", default: cmdShift("w") },
  { id: "open_settings", label: "Settings", category: "Application", default: cmd(",") },
  { id: "open_project_settings", label: "Project Settings", category: "Project", default: bare("f4") },
  { id: "exit", label: "Exit", category: "Application", default: cmd("q") },
  { id: "toggle_preview", label: "Toggle Preview", category: "View", default: cmdShift("p") },
  // The real app has no dedicated shortcut for either of these (View
  // menu's "Editor"/"Binder" are plain nav.button(), not
  // nav.shortcut_button() — see menu_bar.rs) — every *other* dock tab
  // already has one, so this port adds them for consistency rather than
  // leaving the two most-used panels as the only ones without a toggle key.
  { id: "toggle_editor", label: "Toggle Editor", category: "View", default: bare("f1") },
  { id: "toggle_binder", label: "Toggle Binder", category: "View", default: bare("f3") },
  // Never closes the Binder (unlike toggle_binder) — ensures it's open and
  // moves keyboard focus into it, same shape as toggle_binder_focus (F6)
  // but without that action's binder/editor-alternation hack: this one
  // only ever opens-and-focuses, matching the real app's own
  // ToggleBinderFocus/"Reveal in Binder" focus_requested handling (see
  // stores/project.svelte.ts's focusBinder).
  { id: "focus_binder", label: "Focus Binder", category: "View", default: shiftOnly("f3") },
  { id: "save", label: "Save", category: "Editing", default: cmd("s") },
  { id: "new_file", label: "New File", category: "FilesAndFolders", default: cmd("n") },
  { id: "new_folder", label: "New Folder", category: "FilesAndFolders", default: cmdShift("f") },
  { id: "rename", label: "Rename", category: "FilesAndFolders", default: bare("f2") },
  { id: "delete", label: "Delete", category: "FilesAndFolders", default: cmdShift("backspace") },
  { id: "restore", label: "Restore", category: "FilesAndFolders", default: cmdShift("r") },
  { id: "undo_last_move", label: "Undo Last Rename/Move", category: "FilesAndFolders", default: cmdAlt("z") },
  { id: "toggle_dark_mode", label: "Toggle Dark/Light Mode", category: "View", default: cmdShift("d") },
  { id: "toggle_fullscreen", label: "Toggle Full Screen", category: "View", default: bare("f11") },
  { id: "find_replace", label: "Find and Replace", category: "Editing", default: cmd("f") },
  { id: "toggle_corkboard", label: "Toggle Corkboard", category: "View", default: cmdShift("k") },
  { id: "toggle_story_grid", label: "Toggle Story Grid", category: "View", default: cmdShift("g") },
  { id: "toggle_belief_timeline", label: "Toggle Belief Timeline", category: "View", default: cmdShift("e") },
  { id: "toggle_backlinks", label: "Toggle Backlinks", category: "FilesAndFolders", default: cmdShift("b") },
  { id: "toggle_tags", label: "Toggle Tags", category: "View", default: cmdShift("t") },
  { id: "command_prompt", label: "Command Prompt", category: "Tools", default: cmdShift(";") },
  { id: "git_commit", label: "Commit (Git)", category: "Git", default: cmdAlt("c") },
  { id: "git_push", label: "Push (Git)", category: "Git", default: cmdAlt("p") },
  { id: "git_pull", label: "Pull (Git)", category: "Git", default: cmdAlt("l") },
  { id: "git_commit_and_push", label: "Commit and Push (Git)", category: "Git", default: cmdAltShift("c") },
  { id: "edit_metadata", label: "Metadata", category: "Editing", default: cmdShift("m") },
  { id: "toggle_binder_focus", label: "Toggle Binder/Editor Focus", category: "View", default: bare("f6") },
  { id: "toggle_focus_mode", label: "Toggle Focus Mode", category: "View", default: bare("f9") },
  { id: "open_document", label: "Open Document", category: "FilesAndFolders", default: cmd("p") },
  { id: "close_document", label: "Close Document", category: "FilesAndFolders", default: cmd("w") },
  { id: "recent_files", label: "Recent Files", category: "FilesAndFolders", default: cmdShift("o") },
  { id: "go_back", label: "Go Back", category: "FilesAndFolders", default: altOnly("arrowleft") },
  { id: "go_forward", label: "Go Forward", category: "FilesAndFolders", default: altOnly("arrowright") },
  { id: "activate_wikilink", label: "Activate Wikilink", category: "Editing", default: cmd("enter"), inlineConsumed: true },
  { id: "toggle_pomodoro", label: "Toggle Pomodoro Timer", category: "Tools", default: cmdAlt("t") },
  { id: "toggle_word_count", label: "Toggle Word Count", category: "Tools", default: cmdAlt("w") },
  { id: "refresh_word_count", label: "Refresh Word Count", category: "Tools", default: bare("f5") },
  { id: "toggle_collab_panel", label: "Toggle Collaboration Panel", category: "Tools", default: cmdShift("l") },
  { id: "toggle_streak", label: "Toggle Streak Tracking", category: "Tools", default: cmdAlt("s") },
  { id: "toggle_dashboard", label: "Toggle Dashboard", category: "Tools", default: cmdAlt("g") },
  { id: "cycle_binder_color_mode", label: "Cycle Binder Color Mode", category: "View", default: cmdShift("c") },
  { id: "toggle_bookmark", label: "Toggle Bookmark", category: "Editing", default: cmd("f2"), inlineConsumed: true },
  { id: "toggle_bookmarks_panel", label: "Toggle Bookmarks", category: "Tools", default: cmdAlt("b") },
  { id: "next_bookmark", label: "Next Bookmark", category: "FilesAndFolders", default: altOnly("arrowdown") },
  { id: "previous_bookmark", label: "Previous Bookmark", category: "FilesAndFolders", default: altOnly("arrowup") },
  { id: "add_note_at_cursor", label: "Add Note at Cursor", category: "Editing", default: cmdShift("j"), inlineConsumed: true },
  { id: "toggle_notes_panel", label: "Toggle Notes", category: "Tools", default: cmdShift("n") },
  { id: "next_note", label: "Next Note", category: "FilesAndFolders", default: cmdAlt("arrowdown") },
  { id: "previous_note", label: "Previous Note", category: "FilesAndFolders", default: cmdAlt("arrowup") },
  { id: "toggle_document_stats", label: "Toggle Document Stats in Binder", category: "View", default: cmdAlt("d") },
  { id: "preview_zoom_in", label: "Zoom In Preview", category: "View", default: cmd("equal") },
  { id: "preview_zoom_out", label: "Zoom Out Preview", category: "View", default: cmd("minus") },
  { id: "preview_zoom_reset", label: "Reset Preview Zoom", category: "View", default: cmd("0") },
  { id: "toggle_spell_check", label: "Toggle Spell Check", category: "Editing", default: bare("f7") },
  { id: "search_everywhere", label: "Search Everywhere", category: "FilesAndFolders", default: cmdShift("a") },
  { id: "toggle_sync_panel", label: "Toggle Sync Panel", category: "Tools", default: cmdShift("y") },
  { id: "sync_now", label: "Sync Now", category: "Tools", default: cmdAlt("y") },
  { id: "toggle_version_activity", label: "Toggle Version Activity", category: "Git", default: cmdAlt("v") },
  { id: "toggle_editor_view_mode", label: "Toggle Source/Reading View", category: "View", default: cmd("e") },
  { id: "toggle_inline_backlinks", label: "Toggle Backlinks in Document", category: "View", default: cmd("b") },
  { id: "open_daily_note", label: "Open Today's Daily Note", category: "Tools", default: bare("f8") },
];

export const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  "Application",
  "Project",
  "FilesAndFolders",
  "Editing",
  "View",
  "Git",
  "Tools",
];

/** How many modifiers a combo requires — used to check the more specific of
 * two overlapping bindings first (see matchesCombo's doc comment). */
function specificity(combo: KeyCombo): number {
  return (combo.ctrl_or_cmd ? 1 : 0) + (combo.shift ? 1 : 0) + (combo.alt ? 1 : 0);
}

/** The user's override from `Settings.shortcuts` for `id` if one exists
 * (including an explicit unbind, represented as `undefined` — see the
 * Settings dialog's `setShortcut`), else `fallback`. Shared by
 * `effectiveCombo` (built-in actions) and plugin-shortcut resolution below —
 * both key into the same map (see `Settings.shortcuts`'s own doc comment
 * in core/src/settings.rs for why one map covers both). */
function resolveCombo(id: string, fallback: KeyCombo): KeyCombo | undefined {
  const override = settingsStore.value.shortcuts[id];
  if (override) return override;
  if (id in settingsStore.value.shortcuts) return undefined; // explicitly unbound
  return fallback;
}

/** Resolved effective binding for `action`: the user's override from
 * Settings if one exists (including an explicit unbind, represented as
 * `undefined` in the map — see the Settings dialog), else its default. */
export function effectiveCombo(action: ShortcutActionDef): KeyCombo | undefined {
  return resolveCombo(action.id, action.default);
}

/** A loaded plugin command's own declared default shortcut
 * (`register_shortcut`), keyed by command name — refreshed by
 * `refreshPluginShortcuts`, which also doubles as the plugin
 * Command Prompt/tab-completion source of truth (`plugins_list_commands`
 * lives separately, fetched per-component, since only a shortcut needs
 * this one). */
let pluginShortcuts: { name: string; combo: KeyCombo }[] = [];

/** Re-fetches the open project's loaded plugins' declared default
 * shortcuts — called whenever the open project changes and after a
 * "Reload Plugins"/"Enable Project Plugins" menu action, mirroring the
 * real egui app's own `reload_plugins` recomputing
 * `compute_effective_plugin_shortcuts` every time plugins (re)load. */
export async function refreshPluginShortcuts() {
  if (!project.value) {
    pluginShortcuts = [];
    return;
  }
  try {
    pluginShortcuts = await invoke<{ name: string; combo: KeyCombo }[]>(
      "plugins_shortcut_defaults",
      { root: project.value.root },
    );
  } catch {
    pluginShortcuts = [];
  }
}

/** The user's override (or explicit unbind) for a plugin command's default
 * shortcut — same resolution `effectiveCombo` does for a built-in action,
 * exported for the Settings dialog's remapping UI. */
export function effectivePluginCombo(name: string, fallback: KeyCombo): KeyCombo | undefined {
  return resolveCombo(name, fallback);
}

export function setShortcut(actionId: string, combo: KeyCombo | null) {
  if (combo) {
    // Enforce 1:1: strip this combo from whatever other action currently
    // owns it, same as the real app's ShortcutMap::set.
    for (const [id, bound] of Object.entries(settingsStore.value.shortcuts)) {
      if (id !== actionId && combosEqual(bound, combo)) {
        delete settingsStore.value.shortcuts[id];
      }
    }
    settingsStore.value.shortcuts[actionId] = combo;
  } else {
    // An explicit unbind still needs a recorded marker distinguishing it
    // from "no override" — see effectiveCombo. A sentinel empty-key combo
    // serves that role without needing a second map.
    settingsStore.value.shortcuts[actionId] = { key: "", ctrl_or_cmd: false, shift: false, alt: false };
  }
  settingsStore.value = { ...settingsStore.value };
  saveSettingsDebounced();
}

function combosEqual(a: KeyCombo, b: KeyCombo): boolean {
  return a.key === b.key && a.ctrl_or_cmd === b.ctrl_or_cmd && a.shift === b.shift && a.alt === b.alt;
}

const CODE_TO_KEY: Record<string, string> = {
  Backspace: "backspace",
  Enter: "enter",
  Escape: "escape",
  ArrowLeft: "arrowleft",
  ArrowRight: "arrowright",
  ArrowUp: "arrowup",
  ArrowDown: "arrowdown",
  Equal: "equal",
  Minus: "minus",
  Semicolon: ";",
  Comma: ",",
  Period: ".",
  Digit0: "0",
};
for (let i = 1; i <= 9; i++) CODE_TO_KEY[`Digit${i}`] = String(i);
for (let i = 1; i <= 12; i++) CODE_TO_KEY[`F${i}`] = `f${i}`;
for (const letter of "abcdefghijklmnopqrstuvwxyz") {
  CODE_TO_KEY[`Key${letter.toUpperCase()}`] = letter;
}

function eventToKey(event: KeyboardEvent): string | undefined {
  return CODE_TO_KEY[event.code];
}

/** True if `event` satisfies `combo` — using physical `event.code` (not
 * `.key`, which changes under Shift) for the base key, so a combo's `shift`
 * flag is the only thing that determines whether Shift is required. Extra
 * Shift/Alt beyond what the combo requires is tolerated, not rejected —
 * matching egui's `Modifiers::matches_logically` semantics the real app's
 * shortcuts rely on (see shortcuts.rs's `sorted_by_specificity` doc
 * comment): a bare "Cmd+N" pattern also matches a physical Cmd+Alt+N press.
 * This is *why* specificity-sorting matters — see dispatchShortcut. */
function matchesCombo(event: KeyboardEvent, combo: KeyCombo): boolean {
  const key = eventToKey(event);
  if (key === undefined || key !== combo.key) return false;
  const ctrlOrCmd = isMac() ? event.metaKey : event.ctrlKey;
  if (ctrlOrCmd !== combo.ctrl_or_cmd) return false;
  if (combo.shift && !event.shiftKey) return false;
  if (combo.alt && !event.altKey) return false;
  return true;
}

function isMac(): boolean {
  return typeof navigator !== "undefined" && /mac/i.test(navigator.platform ?? navigator.userAgent ?? "");
}

export type ShortcutHandler = () => void;

/** Registered by App.svelte once real handlers exist for an action; an
 * action with no entry here falls through to notImplemented(). Keeping
 * this separate from SHORTCUT_ACTIONS keeps the catalog itself pure data,
 * shared as-is with the MenuBar and the Settings dialog's remapping UI. */
const handlers: Record<string, ShortcutHandler> = {};

export function registerShortcutHandler(actionId: string, handler: ShortcutHandler) {
  handlers[actionId] = handler;
}

export function runShortcutAction(actionId: string) {
  const action = SHORTCUT_ACTIONS.find((a) => a.id === actionId);
  const handler = handlers[actionId];
  if (handler) {
    handler();
  } else {
    notImplemented(action?.label ?? actionId);
  }
}

/** The global keydown handler — install once, on `window`, for the whole
 * app's lifetime (desktop only; see App.svelte). Checks every bound,
 * non-inline-consumed action's effective combo against the event, most-
 * specific-first, same ordering the real app's `sorted_by_specificity`
 * exists to enforce (see matchesCombo's doc comment for why order matters:
 * without it, a 1-modifier binding could silently steal a keypress meant
 * for an overlapping 2-modifier one). */
type DispatchCandidate = { id: string; combo: KeyCombo; run: () => void };

// TEMPORARY — diagnosing the F3/Shift+F3-does-nothing-while-editor-focused
// report. Logs every keydown this function actually receives (so a report
// of "pressing F3 did nothing" can be told apart from "the event never
// reached the page at all" — e.g. the webview's own native Find-in-page
// accelerator consuming F3 before any DOM listener sees it — vs. "it
// arrived but no shortcut matched it"). Safe to strip once that's known;
// gated behind a single flag so it's a one-line revert.
const DEBUG_SHORTCUTS = true;

export function handleGlobalKeydown(event: KeyboardEvent) {
  if (!dockLayoutRegistry.api && !project.value) return; // no project open yet — most actions are meaningless
  if (DEBUG_SHORTCUTS) {
    console.debug(
      `[shortcuts] keydown code=${event.code} key=${event.key} ctrl=${event.ctrlKey} meta=${event.metaKey} shift=${event.shiftKey} alt=${event.altKey} target=${(event.target as HTMLElement | null)?.tagName}${(event.target as HTMLElement | null)?.className ? "." + (event.target as HTMLElement).className : ""}`,
    );
  }
  const builtins: DispatchCandidate[] = SHORTCUT_ACTIONS.filter((a) => !a.inlineConsumed)
    .map((a) => ({ action: a, combo: effectiveCombo(a) }))
    .filter((c): c is { action: ShortcutActionDef; combo: KeyCombo } => !!c.combo && c.combo.key !== "")
    .map((c) => ({ id: c.action.id, combo: c.combo, run: () => runShortcutAction(c.action.id) }));
  // `:` command names are already globally unique across loaded plugins
  // (see core::plugins::load's own conflict handling), so no qualification
  // needed here — matches the real app's own merged built-in+plugin
  // shortcut list (shortcuts.rs's `sorted_by_specificity` doc comment).
  const plugins: DispatchCandidate[] = pluginShortcuts
    .map((p) => ({ name: p.name, combo: effectivePluginCombo(p.name, p.combo) }))
    .filter((c): c is { name: string; combo: KeyCombo } => !!c.combo && c.combo.key !== "")
    .map((c) => ({ id: `plugin:${c.name}`, combo: c.combo, run: () => void runPluginCommand(c.name, "") }));
  const candidates = [...builtins, ...plugins].sort(
    (a, b) => specificity(b.combo) - specificity(a.combo),
  );

  for (const { id, combo, run } of candidates) {
    if (matchesCombo(event, combo)) {
      if (DEBUG_SHORTCUTS) console.debug(`[shortcuts] matched ${id}`, combo);
      event.preventDefault();
      run();
      return;
    }
  }
  if (DEBUG_SHORTCUTS) console.debug("[shortcuts] no candidate matched");
}

// --- Built-in handlers for actions with a real implementation already ---
// Dock-tab toggles all go through the same DockLayout.openPanel (which
// focuses an already-open panel or opens it fresh) — toggle-closed isn't
// implemented (openPanel has no "close" half), same gap the real app's own
// toggle actions don't have but this port's dock integration doesn't
// support cleanly yet; opening is still the common case.
const DOCK_TAB_ACTIONS: Record<string, string> = {
  toggle_editor: "editor",
  toggle_binder: "binder",
  toggle_preview: "preview",
  toggle_corkboard: "corkboard",
  toggle_story_grid: "storygrid",
  toggle_belief_timeline: "belieftimeline",
  toggle_backlinks: "backlinks",
  toggle_tags: "tags",
  edit_metadata: "metadata",
  toggle_pomodoro: "pomodoro",
  toggle_word_count: "wordcount",
  toggle_collab_panel: "collab",
  toggle_streak: "streak",
  toggle_dashboard: "dashboard",
  toggle_bookmarks_panel: "bookmarks",
  toggle_notes_panel: "notes",
  toggle_sync_panel: "sync",
  toggle_version_activity: "versionactivity",
};

export function installBuiltinShortcutHandlers() {
  for (const [actionId, panelId] of Object.entries(DOCK_TAB_ACTIONS)) {
    registerShortcutHandler(actionId, () => dockLayoutRegistry.api?.openPanel(panelId));
  }
  registerShortcutHandler("save", () => manualSaveDocument());
  registerShortcutHandler("close_document", closeDocument);
  registerShortcutHandler("new_file", newDocumentAtSelection);
  registerShortcutHandler("new_folder", newFolderAtSelection);
  registerShortcutHandler("rename", renameSelection);
  registerShortcutHandler("delete", deleteSelection);
  registerShortcutHandler("restore", restoreSelection);
  registerShortcutHandler("undo_last_move", undoLastStructuralOp);
  registerShortcutHandler("next_bookmark", () => cycleBookmark(1));
  registerShortcutHandler("previous_bookmark", () => cycleBookmark(-1));
  registerShortcutHandler("next_note", () => cycleNote(1));
  registerShortcutHandler("previous_note", () => cycleNote(-1));
  registerShortcutHandler("open_daily_note", openDailyNote);
  registerShortcutHandler("sync_now", () => invoke("sync_demo_now"));
  registerShortcutHandler("refresh_word_count", () => {
    if (wordCountRegistry.api) wordCountRegistry.api.refresh();
    else dockLayoutRegistry.api?.openPanel("wordcount");
  });
  registerShortcutHandler("preview_zoom_in", zoomInPreview);
  registerShortcutHandler("preview_zoom_out", zoomOutPreview);
  registerShortcutHandler("preview_zoom_reset", resetPreviewZoom);
  registerShortcutHandler("toggle_editor_view_mode", toggleEditorViewMode);
  registerShortcutHandler("toggle_inline_backlinks", toggleInlineBacklinks);
  registerShortcutHandler("toggle_dark_mode", toggleDarkMode);
  registerShortcutHandler("toggle_focus_mode", toggleFocusMode);

  // A simplification from the real app's per-project remembered language on
  // toggle-off (core::project::ProjectMeta::last_spell_check_language) — this
  // port has one global Settings field and no per-project memory, so the
  // "last used" language is just remembered here, in memory, for this
  // session only.
  let lastSpellCheckLanguage: SpellCheckLanguage = "English";
  registerShortcutHandler("toggle_spell_check", () => {
    if (settingsStore.value.spell_check_language !== "Off") {
      lastSpellCheckLanguage = settingsStore.value.spell_check_language;
      settingsStore.value.spell_check_language = "Off";
    } else {
      settingsStore.value.spell_check_language = lastSpellCheckLanguage;
    }
    settingsStore.value = { ...settingsStore.value };
    saveSettingsDebounced();
    recheckSpelling();
  });
  registerShortcutHandler("cycle_binder_color_mode", cycleBinderColorMode);
  registerShortcutHandler("go_back", goBackDocument);
  registerShortcutHandler("go_forward", goForwardDocument);
  registerShortcutHandler("toggle_document_stats", () => {
    settingsStore.value.show_document_stats_in_binder =
      !settingsStore.value.show_document_stats_in_binder;
    settingsStore.value = { ...settingsStore.value };
    saveSettingsDebounced();
  });
  registerShortcutHandler("exit", async () => {
    await flushBeforeExit();
    await getCurrentWindow().close();
  });
  registerShortcutHandler("toggle_fullscreen", async () => {
    const win = getCurrentWindow();
    const isFullscreen = await win.isFullscreen();
    await win.setFullscreen(!isFullscreen);
  });

  // No true "which dock panel has focus" query exists (dockLayoutRegistry
  // only exposes openPanel) — approximated as alternating which of the two
  // it last asked for, rather than a real focus check.
  let binderFocused = false;
  registerShortcutHandler("toggle_binder_focus", () => {
    binderFocused = !binderFocused;
    dockLayoutRegistry.api?.openPanel(binderFocused ? "binder" : "editor");
  });
  registerShortcutHandler("focus_binder", () => {
    dockLayoutRegistry.api?.ensurePanelOpen("binder");
  });
}
