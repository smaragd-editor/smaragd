<script lang="ts">
  import { onMount, tick } from "svelte";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
  import { invoke } from "@tauri-apps/api/core";
  import {
    type BinderColorMode,
    type BinderNodeDto,
    project,
    closeProject,
    openProject,
    createProject,
    openFindReplace,
    onTreeChange,
  } from "./stores/project.svelte";
  import AboutDialog from "./AboutDialog.svelte";
  import { dockLayoutRegistry } from "./stores/dockLayoutRegistry.svelte";
  import { settingsStore, saveSettingsDebounced } from "./stores/settings.svelte";
  import { SHORTCUT_ACTIONS, effectiveCombo, runShortcutAction, registerShortcutHandler } from "./shortcuts";
  import { showToast } from "./stores/toast.svelte";
  import { applyTheme } from "./stores/theme.svelte";
  import { exportRequest, requestExport, closeExportRequest } from "./stores/exportRequest.svelte";
  import {
    settingsRequest,
    requestSettings,
    closeSettingsRequest,
    projectSettingsRequest,
    requestProjectSettings,
    closeProjectSettingsRequest,
  } from "./stores/settingsRequest.svelte";
  import { showPrompt } from "./stores/promptDialog.svelte";

  // Desktop menu bar matching the real egui app's 8-menu structure
  // (app/src/app/menu_bar.rs) as closely as this port's actual
  // functionality allows. Every item from that file is represented; most
  // now call a real action — Export, Find & Replace, Command Prompt,
  // Search Everywhere, git Commit/Push/Pull/Commit+Push, saved named
  // Layouts, About, and docx/epub/PDF/Scrivener Import were all stubbed
  // notImplemented() placeholders until this pass, listed for structural
  // fidelity first and wired for real once a user asked for them.
  //
  // Still genuinely stubbed, deliberately: Reload Plugins/Enable Project
  // Plugins — different in kind, not just unfinished: there is no plugin
  // engine anywhere in this Tauri port (no Rhai scripting, no :command
  // registration), so there's nothing to reload. It's left as a clear
  // "no plugin engine in this build" message rather than faked as if a
  // real action were just missing its wiring.
  //
  // New Project prompts for a name then reuses the same folder picker Open
  // Project does, rather than a dedicated creation wizard. Exit flushes any
  // pending autosave (see `flushBeforeExit`) then closes the window — no
  // confirm-before-close modal, since this port autosaves on an 800ms
  // debounce rather than the real app's explicit-save/dirty-tab model, so
  // there's no meaningful "unsaved changes" state to guard beyond that.
  //
  // Project Settings (ProjectSettingsDialog.svelte) covers Binder color
  // mode, Daily Notes, Folder Roles, and Status/POV colors — a bounded
  // subset of the real app's 5-category panel; Git auto-commit config, the
  // Sync "also sync non-text files" toggle, Attachments destination, and
  // the Daily Notes template picker aren't wired, each its own chunk of
  // core methods with no existing command either, same shape as what is
  // here, just not done yet.
  //
  // Open Document now opens the same quick-switcher as Search Everywhere —
  // this port's Search Everywhere was already scoped down to document-title
  // search only (see SearchEverywhere.svelte's own comment), so it already
  // *is* what the real app's separate Cmd+P quick-open does; Recent Files
  // and Go Back/Forward are a plain client-side history/recency list (see
  // stores/project.svelte.ts), not the real app's server-held
  // core::editor::EditorState — this port's document model has no tabs for
  // that state to live on.
  //
  // Recent Projects, Import's per-format choice, Theme, and Color Binder
  // By are all real flyouts now, the same `submenu` Item variant — Recent
  // Projects is backed by settingsStore.value.recent_project_paths,
  // recorded on every successful open/create (stores/project.svelte.ts's
  // recordRecentProject).
  let openMenu = $state<string | null>(null);

  type Item =
    | { separator: true }
    | {
        label: string;
        shortcutId?: string;
        action: () => void;
        disabled?: boolean;
        checked?: boolean;
      }
    | { label: string; submenu: () => Item[]; disabled?: boolean };

  function toggle(menu: string) {
    openMenu = openMenu === menu ? null : menu;
  }

  function close() {
    openMenu = null;
    closeSubmenu();
  }

  function run(action: () => void) {
    const menuId = openMenu;
    action();
    close();
    // Returns focus to the triggering menu-label after an item is
    // activated — otherwise, since the activated `.item` button (and the
    // whole dropdown) unmounts immediately, a keyboard user's focus would
    // silently fall back to the document body.
    const idx = menus.findIndex((m) => m.id === menuId);
    if (idx !== -1) menuLabelRefs[idx]?.focus();
  }

  // Theme/Color Binder By's flyouts need `position: fixed` with a
  // JS-computed screen position rather than plain CSS :hover + `left:
  // 100%` — the dropdown they live in has `overflow: auto` (so a long
  // menu can scroll instead of running off-screen), and an
  // absolutely-positioned submenu is clipped by that regardless of DOM
  // nesting; `position: fixed` escapes it since nothing up the ancestor
  // chain uses `transform`/`filter`/`contain` to create a new containing
  // block for fixed-position descendants.
  let submenuTrigger = $state<{ index: number; top: number; left: number } | null>(null);
  // Since `.submenu` is fixed-positioned (not visually inside
  // `.submenu-trigger`), moving the pointer from the trigger label across
  // to the flyout itself briefly leaves the trigger's own box — a short
  // grace period before actually closing is what keeps that from
  // flickering shut mid-move, same trick native menus use.
  let submenuCloseTimer: ReturnType<typeof setTimeout> | undefined;

  function openSubmenuAt(index: number, el: HTMLElement) {
    clearTimeout(submenuCloseTimer);
    const rect = el.getBoundingClientRect();
    submenuTrigger = { index, top: rect.top, left: rect.right };
  }

  function openSubmenu(e: MouseEvent, index: number) {
    openSubmenuAt(index, e.currentTarget as HTMLElement);
  }

  function scheduleCloseSubmenu() {
    clearTimeout(submenuCloseTimer);
    submenuCloseTimer = setTimeout(() => {
      submenuTrigger = null;
    }, 150);
  }

  function cancelCloseSubmenu() {
    clearTimeout(submenuCloseTimer);
  }

  function closeSubmenu() {
    clearTimeout(submenuCloseTimer);
    submenuTrigger = null;
  }

  // Keyboard navigation: a roving-tabindex menubar (only `activeMenuIndex`'s
  // label is Tab-reachable; arrow keys move real DOM focus between labels
  // and, once a dropdown/submenu is open, between its own items) rather than
  // a state-tracked "highlighted index" — real focus means Enter/Space on an
  // `.item` button already fires its onclick for free, and a screen reader
  // follows along without extra aria-activedescendant plumbing.
  let menuLabelRefs: (HTMLButtonElement | null)[] = [];
  let dropdownEl = $state<HTMLDivElement | undefined>();
  let submenuEl = $state<HTMLDivElement | undefined>();
  let activeMenuIndex = $state(0);

  // Only the two levels this menu actually has (`.dropdown`'s direct
  // children, `.submenu`'s direct children) — `:scope >` keeps this from
  // also matching a nested-open submenu's own `.item`s when called on the
  // dropdown that contains it.
  function scopedFocusables(container: HTMLElement | undefined): HTMLElement[] {
    if (!container) return [];
    return Array.from(
      container.querySelectorAll<HTMLElement>(
        ":scope > .item:not(:disabled), :scope > .submenu-trigger:not(.disabled)",
      ),
    );
  }

  function focusFirst(container: HTMLElement | undefined) {
    scopedFocusables(container)[0]?.focus();
  }

  function focusLast(container: HTMLElement | undefined) {
    const els = scopedFocusables(container);
    els[els.length - 1]?.focus();
  }

  function focusDelta(container: HTMLElement | undefined, delta: number) {
    const els = scopedFocusables(container);
    if (els.length === 0) return;
    const current = els.indexOf(document.activeElement as HTMLElement);
    const next = current === -1 ? (delta > 0 ? 0 : els.length - 1) : (current + delta + els.length) % els.length;
    els[next]?.focus();
  }

  // Alt+<mnemonic> (Alt+F for File, etc. — see each menu's own `mnemonic`
  // above) opens that menu directly and focuses its first item, matching
  // the real app's own `top_menu_button(ui, label, mnemonic_key, ...)`.
  async function openMenuViaMnemonic(index: number) {
    menuLabelRefs[index]?.focus();
    openMenu = menus[index].id;
    await tick();
    focusFirst(dropdownEl);
  }

  function handleWindowKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      close();
      return;
    }
    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const index = menus.findIndex((m) => m.mnemonic.toLowerCase() === e.key.toLowerCase());
    if (index === -1) return;
    e.preventDefault();
    openMenuViaMnemonic(index);
  }

  async function switchMenu(fromIndex: number, dir: 1 | -1, focusFirstItem: boolean) {
    const next = (fromIndex + dir + menus.length) % menus.length;
    menuLabelRefs[next]?.focus();
    if (focusFirstItem) {
      openMenu = menus[next].id;
      await tick();
      focusFirst(dropdownEl);
    }
  }

  async function onMenuLabelKeydown(e: KeyboardEvent, index: number) {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowLeft":
        e.preventDefault();
        await switchMenu(index, e.key === "ArrowRight" ? 1 : -1, openMenu !== null);
        break;
      case "ArrowDown":
      case "Enter":
      case " ":
        e.preventDefault();
        openMenu = menus[index].id;
        await tick();
        focusFirst(dropdownEl);
        break;
      case "ArrowUp":
        e.preventDefault();
        openMenu = menus[index].id;
        await tick();
        focusLast(dropdownEl);
        break;
    }
  }

  async function onDropdownKeydown(e: KeyboardEvent, index: number) {
    const active = document.activeElement as HTMLElement | null;
    const isTrigger =
      (active?.classList.contains("submenu-trigger") && !active.classList.contains("disabled")) ?? false;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusDelta(dropdownEl, 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusDelta(dropdownEl, -1);
        break;
      case "Home":
        e.preventDefault();
        focusFirst(dropdownEl);
        break;
      case "End":
        e.preventDefault();
        focusLast(dropdownEl);
        break;
      case "ArrowRight":
        e.preventDefault();
        if (isTrigger && active) {
          openSubmenuAt(Number(active.dataset.index), active);
          await tick();
          focusFirst(submenuEl);
        } else {
          await switchMenu(index, 1, true);
        }
        break;
      case "ArrowLeft":
        e.preventDefault();
        await switchMenu(index, -1, true);
        break;
      case "Enter":
      case " ":
        if (isTrigger && active) {
          e.preventDefault();
          openSubmenuAt(Number(active.dataset.index), active);
          await tick();
          focusFirst(submenuEl);
        }
        break;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        close();
        menuLabelRefs[index]?.focus();
        break;
      case "Tab":
        close();
        break;
    }
  }

  function onSubmenuKeydown(e: KeyboardEvent, triggerIndex: number) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        e.stopPropagation();
        focusDelta(submenuEl, 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        e.stopPropagation();
        focusDelta(submenuEl, -1);
        break;
      case "Home":
        e.preventDefault();
        e.stopPropagation();
        focusFirst(submenuEl);
        break;
      case "End":
        e.preventDefault();
        e.stopPropagation();
        focusLast(submenuEl);
        break;
      case "ArrowLeft":
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        closeSubmenu();
        dropdownEl?.querySelector<HTMLElement>(`[data-index="${triggerIndex}"]`)?.focus();
        break;
      case "Tab":
        close();
        break;
    }
  }

  function dock(id: string) {
    dockLayoutRegistry.api?.openPanel(id);
  }

  function shortcutLabel(actionId: string): string | undefined {
    const action = SHORTCUT_ACTIONS.find((a) => a.id === actionId);
    if (!action) return undefined;
    const combo = effectiveCombo(action);
    if (!combo || combo.key === "") return undefined;
    const mod = combo.ctrl_or_cmd ? "Ctrl+" : "";
    const alt = combo.alt ? "Alt+" : "";
    const shift = combo.shift ? "Shift+" : "";
    return `${mod}${alt}${shift}${combo.key.toUpperCase()}`;
  }

  const hasProject = $derived(!!project.value);
  // Every `dock(id)` call below is a silent no-op without a project — the
  // whole dock layout (DockLayout.svelte, which owns dockLayoutRegistry.api)
  // only mounts once ProjectView.svelte has a project to show
  // (frontend/src/ProjectView.svelte's `{#if !project.value}` empty-state
  // branch), so there's no dock tab for these to open at all until then.
  const hasDocument = $derived(!!project.selectedPath);

  // "Use the open screen" was a dead end: it isn't visible once a project
  // is already open, which is exactly when someone wants File > Open
  // Project to switch to a different one. Same folder-picker + openProject
  // flow ProjectView.svelte's own "Browse…" button uses.
  async function pickAndOpenProject() {
    const selected = await openFileDialog({ directory: true, multiple: false });
    if (typeof selected === "string") await openProject(selected);
  }

  // A name prompt + a parent-folder picker, joined with "/" — plain string
  // concatenation rather than a path-joining helper, since there isn't one
  // in scope on the frontend side; `Path::new` on the Rust side accepts "/"
  // on every platform Tauri targets, so this is safe despite not being a
  // "real" path-join.
  async function pickAndCreateProject() {
    const name = await showPrompt("New project name:");
    if (!name) return;
    const parent = await openFileDialog({ directory: true, multiple: false });
    if (typeof parent !== "string") return;
    await createProject(`${parent}/${name}`);
    if (project.openError) showToast(`Couldn't create project: ${project.openError}`);
  }

  async function pickAndImport(format: "docx" | "epub" | "pdf") {
    if (!project.value) return;
    const extensions: Record<string, string[]> = {
      docx: ["docx"],
      epub: ["epub"],
      pdf: ["pdf"],
    };
    const path = await openFileDialog({
      multiple: false,
      filters: [{ name: format.toUpperCase(), extensions: extensions[format] }],
    });
    if (typeof path !== "string") return;
    try {
      await invoke("import_file", {
        root: project.value.root,
        parent: project.value.root,
        format,
        filePath: path,
      });
      showToast("Imported");
    } catch (err) {
      showToast(`Import failed: ${err}`);
    }
  }

  async function pickAndImportScrivener() {
    if (!project.value) return;
    const dir = await openFileDialog({ directory: true, multiple: false });
    if (typeof dir !== "string") return;
    try {
      await invoke("import_scrivener", {
        root: project.value.root,
        parent: project.value.root,
        scrivenerDir: dir,
      });
      showToast("Imported");
    } catch (err) {
      showToast(`Import failed: ${err}`);
    }
  }

  function reloadPlugins() {
    showToast("No plugin engine in this build — there's nothing to reload yet.");
  }

  async function saveCurrentLayout() {
    if (!dockLayoutRegistry.api) return;
    const name = await showPrompt("Save current layout as:");
    if (!name) return;
    dockLayoutRegistry.api.saveCurrentLayoutAs(name);
    showToast(`Layout "${name}" saved`);
  }

  function layoutItems(): Item[] {
    const names = dockLayoutRegistry.api?.listSavedLayouts() ?? [];
    if (names.length === 0) {
      return [{ label: "No saved layouts", action: () => {}, disabled: true }];
    }
    return names.map((name) => ({
      label: name,
      action: () => dockLayoutRegistry.api?.loadSavedLayout(name),
    }));
  }

  const menus: { id: string; label: string; mnemonic: string; items: () => Item[] }[] = [
    {
      id: "file",
      label: "File",
      mnemonic: "F",
      items: () => [
        { label: "New Project…", shortcutId: "new_project", action: pickAndCreateProject },
        { label: "Open Project…", shortcutId: "open_project", action: pickAndOpenProject },
        { label: "Recent Projects", submenu: recentProjectsSubmenuItems },
        {
          label: "Close Project",
          shortcutId: "close_project",
          action: closeProject,
          disabled: !hasProject,
        },
        { separator: true },
        {
          label: "Open Document…",
          shortcutId: "open_document",
          action: () => runShortcutAction("open_document"),
        },
        {
          label: "Search Everywhere…",
          shortcutId: "search_everywhere",
          action: () => runShortcutAction("search_everywhere"),
        },
        {
          label: "Recent Files…",
          shortcutId: "recent_files",
          action: () => runShortcutAction("recent_files"),
        },
        {
          label: "Close Document",
          shortcutId: "close_document",
          action: () => runShortcutAction("close_document"),
        },
        { label: "Go Back", shortcutId: "go_back", action: () => runShortcutAction("go_back") },
        { label: "Go Forward", shortcutId: "go_forward", action: () => runShortcutAction("go_forward") },
        { separator: true },
        {
          label: "Import",
          disabled: !hasProject,
          submenu: () => [
            { label: "Word Document (.docx)…", action: () => pickAndImport("docx") },
            { label: "EPUB (.epub)…", action: () => pickAndImport("epub") },
            { label: "PDF (.pdf)…", action: () => pickAndImport("pdf") },
            { label: "Scrivener Project…", action: pickAndImportScrivener },
          ],
        },
        { label: "Export Manuscript…", action: () => requestExport(), disabled: !hasProject },
        { separator: true },
        { label: "Settings…", shortcutId: "open_settings", action: () => requestSettings() },
        {
          label: "Project Settings…",
          shortcutId: "open_project_settings",
          action: () => requestProjectSettings(),
          disabled: !hasProject,
        },
        { separator: true },
        { label: "Exit", shortcutId: "exit", action: () => runShortcutAction("exit") },
      ],
    },
    {
      id: "edit",
      label: "Edit",
      mnemonic: "E",
      items: () => [
        { label: "Cut", action: () => document.execCommand("cut") },
        { label: "Copy", action: () => document.execCommand("copy") },
        { label: "Paste", action: () => document.execCommand("paste") },
        { separator: true },
        {
          label: "Find and Replace",
          shortcutId: "find_replace",
          action: () => runShortcutAction("find_replace"),
          disabled: !hasDocument,
        },
      ],
    },
    {
      id: "view",
      label: "View",
      mnemonic: "V",
      items: () => [
        { label: "Editor", action: () => dock("editor"), disabled: !hasProject },
        {
          label: "Preview",
          shortcutId: "toggle_preview",
          action: () => dock("preview"),
          disabled: !hasProject,
        },
        {
          label: "Corkboard",
          shortcutId: "toggle_corkboard",
          action: () => dock("corkboard"),
          disabled: !hasProject,
        },
        {
          label: "Story Grid",
          shortcutId: "toggle_story_grid",
          action: () => dock("storygrid"),
          disabled: !hasProject,
        },
        {
          label: "Belief Timeline",
          shortcutId: "toggle_belief_timeline",
          action: () => dock("belieftimeline"),
          disabled: !hasProject,
        },
        { separator: true },
        { label: "Binder", action: () => dock("binder"), disabled: !hasProject },
        {
          label: "Metadata",
          shortcutId: "edit_metadata",
          action: () => dock("metadata"),
          disabled: !hasProject,
        },
        {
          label: "Backlinks",
          shortcutId: "toggle_backlinks",
          action: () => dock("backlinks"),
          disabled: !hasProject,
        },
        { label: "Tags", shortcutId: "toggle_tags", action: () => dock("tags"), disabled: !hasProject },
        { separator: true },
        { label: "Theme", submenu: themeSubmenuItems },
        ...(hasProject ? [{ label: "Color Binder By", submenu: colorBinderBySubmenuItems } as Item] : []),
      ],
    },
    {
      id: "tools",
      label: "Tools",
      mnemonic: "T",
      items: () => [
        {
          label: "Focus Mode",
          shortcutId: "toggle_focus_mode",
          action: () => runShortcutAction("toggle_focus_mode"),
        },
        {
          label: "Toggle Spell Check",
          shortcutId: "toggle_spell_check",
          action: () => runShortcutAction("toggle_spell_check"),
        },
        { separator: true },
        {
          label: "Command Prompt",
          shortcutId: "command_prompt",
          action: () => runShortcutAction("command_prompt"),
        },
        {
          label: "Pomodoro Timer",
          shortcutId: "toggle_pomodoro",
          action: () => dock("pomodoro"),
          disabled: !hasProject,
        },
        {
          label: "Word Count",
          shortcutId: "toggle_word_count",
          action: () => dock("wordcount"),
          disabled: !hasProject,
        },
        {
          label: "Streak",
          shortcutId: "toggle_streak",
          action: () => dock("streak"),
          disabled: !hasProject,
        },
        {
          label: "Dashboard",
          shortcutId: "toggle_dashboard",
          action: () => dock("dashboard"),
          disabled: !hasProject,
        },
        {
          label: "Bookmarks",
          shortcutId: "toggle_bookmarks_panel",
          action: () => dock("bookmarks"),
          disabled: !hasProject,
        },
        {
          label: "Notes",
          shortcutId: "toggle_notes_panel",
          action: () => dock("notes"),
          disabled: !hasProject,
        },
        { separator: true },
        {
          label: "Sync Panel",
          shortcutId: "toggle_sync_panel",
          action: () => dock("sync"),
          disabled: !hasProject,
        },
        { label: "Sync Now", shortcutId: "sync_now", action: () => runShortcutAction("sync_now") },
        { separator: true },
        { label: "Reload Plugins", action: reloadPlugins },
        { label: "Enable Project Plugins", action: reloadPlugins },
      ],
    },
    {
      id: "versions",
      label: "Versions",
      // "S", not "V" (Versions' own first letter) — View already claims
      // Alt+V, matching the real app's own mnemonic choice here.
      mnemonic: "S",
      items: () => [
        {
          label: "Commit",
          shortcutId: "git_commit",
          action: () => runShortcutAction("git_commit"),
          disabled: !hasProject,
        },
        {
          label: "Commit and Push",
          shortcutId: "git_commit_and_push",
          action: () => runShortcutAction("git_commit_and_push"),
          disabled: !hasProject,
        },
        {
          label: "Push",
          shortcutId: "git_push",
          action: () => runShortcutAction("git_push"),
          disabled: !hasProject,
        },
        {
          label: "Pull",
          shortcutId: "git_pull",
          action: () => runShortcutAction("git_pull"),
          disabled: !hasProject,
        },
        { separator: true },
        {
          label: "Version Activity",
          shortcutId: "toggle_version_activity",
          action: () => dock("versionactivity"),
          disabled: !hasProject,
        },
      ],
    },
    {
      id: "collaborate",
      label: "Collaborate",
      mnemonic: "C",
      items: () => [
        { label: "Host Session", action: () => dock("collab"), disabled: !hasProject },
        { label: "Join Session…", action: () => dock("collab"), disabled: !hasProject },
        { label: "End Session", action: () => dock("collab"), disabled: !hasProject },
        { separator: true },
        {
          label: "Collaboration Panel",
          shortcutId: "toggle_collab_panel",
          action: () => dock("collab"),
          disabled: !hasProject,
        },
      ],
    },
    {
      id: "window",
      label: "Window",
      mnemonic: "W",
      items: () => [
        { label: "Save Current Layout…", action: saveCurrentLayout, disabled: !hasProject },
        { label: "Layouts", action: () => {}, disabled: true },
        ...layoutItems(),
        { separator: true },
        {
          label: "Restore Default Layout",
          action: () => dockLayoutRegistry.api?.resetLayout(),
          disabled: !hasProject,
        },
      ],
    },
    {
      id: "help",
      label: "Help",
      mnemonic: "H",
      items: () => [
        {
          label: "User Manual",
          action: () => openUrl("https://ljantzen.github.io/smaragd/manual/"),
        },
        { separator: true },
        { label: "About", action: () => (showAbout = true) },
      ],
    },
  ];

  // "Reload Custom Themes" (the real app's menu has it right above this
  // list) isn't included — that's for themes loaded from files on disk, a
  // feature this port doesn't have at all (its `color_themes_list` is a
  // fixed built-in set), not a wiring gap to fill in.
  function themeSubmenuItems(): Item[] {
    const items: Item[] = [
      {
        label: "Default",
        action: () => setTheme(null),
        checked: settingsStore.value.color_theme === null,
      },
    ];
    for (const theme of settingsStore.colorThemes) {
      items.push({
        label: theme.label,
        action: () => setTheme(theme.id),
        checked: settingsStore.value.color_theme === theme.id,
      });
    }
    return items;
  }

  function setTheme(id: string | null) {
    settingsStore.value.color_theme = id;
    settingsStore.value = { ...settingsStore.value };
    saveSettingsDebounced();
    applyTheme();
  }

  const BINDER_COLOR_MODES: { mode: BinderColorMode; label: string }[] = [
    { mode: "Off", label: "Off" },
    { mode: "Status", label: "Status" },
    { mode: "Pov", label: "POV" },
    { mode: "WordCountProgress", label: "Word Count" },
  ];

  // Recorded on every successful open/create (stores/project.svelte.ts's
  // recordRecentProject, mirroring core::settings::Settings::
  // record_recent_project's most-recent-first/de-duped/capped shape) —
  // this submenu just reads that list back.
  function recentProjectsSubmenuItems(): Item[] {
    const paths = settingsStore.value.recent_project_paths;
    if (paths.length === 0) {
      return [{ label: "No recent projects", action: () => {}, disabled: true }];
    }
    return paths.map((path) => ({
      label: path.split("/").pop() || path,
      action: () => openProject(path),
    }));
  }

  function colorBinderBySubmenuItems(): Item[] {
    return BINDER_COLOR_MODES.map(({ mode, label }) => ({
      label,
      action: () => setBinderColorMode(mode),
      checked: project.value?.binder_color_mode === mode,
    }));
  }

  async function setBinderColorMode(mode: BinderColorMode) {
    if (!project.value) return;
    try {
      const result = await invoke<{ binder_color_mode: BinderColorMode; tree: BinderNodeDto }>(
        "set_binder_color_mode",
        { root: project.value.root, mode },
      );
      project.value.binder_color_mode = result.binder_color_mode;
      onTreeChange(result.tree);
    } catch (err) {
      showToast(String(err));
    }
  }

  let showAbout = $state(false);
  let showCommandPrompt = $state(false);
  let showSearchEverywhere = $state(false);
  let showRecentFiles = $state(false);
  let showGitCommit = $state(false);
  let gitCommitAndPush = $state(false);

  onMount(() => {
    registerShortcutHandler("new_project", pickAndCreateProject);
    registerShortcutHandler("open_project", pickAndOpenProject);
    registerShortcutHandler("close_project", closeProject);
    registerShortcutHandler("open_settings", () => requestSettings());
    registerShortcutHandler("open_project_settings", () => {
      if (project.value) requestProjectSettings();
    });
    registerShortcutHandler("find_replace", openFindReplace);
    registerShortcutHandler("command_prompt", () => (showCommandPrompt = true));
    registerShortcutHandler("search_everywhere", () => (showSearchEverywhere = true));
    registerShortcutHandler("open_document", () => (showSearchEverywhere = true));
    registerShortcutHandler("recent_files", () => (showRecentFiles = true));
    registerShortcutHandler("git_commit", () => {
      gitCommitAndPush = false;
      showGitCommit = true;
    });
    registerShortcutHandler("git_commit_and_push", () => {
      gitCommitAndPush = true;
      showGitCommit = true;
    });
    registerShortcutHandler("git_push", async () => {
      if (!project.value) return;
      try {
        const result = await invoke<{ files: string[] }>("git_push", { root: project.value.root });
        showToast(`Pushed (${result.files.length} file(s))`);
      } catch (err) {
        showToast(`Push failed: ${err}`);
      }
    });
    registerShortcutHandler("git_pull", async () => {
      if (!project.value) return;
      try {
        const result = await invoke<{ files: string[] }>("git_pull", { root: project.value.root });
        showToast(`Pulled (${result.files.length} file(s))`);
      } catch (err) {
        showToast(`Pull failed: ${err}`);
      }
    });
  });

  function handleWindowClick(event: MouseEvent) {
    if (!(event.target as HTMLElement).closest(".menu-bar")) close();
  }
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleWindowKeydown} />

<nav class="menu-bar">
  {#each menus as menu, mi (menu.id)}
    <div class="menu">
      <button
        class="menu-label"
        role="menuitem"
        aria-haspopup="true"
        aria-expanded={openMenu === menu.id}
        class:open={openMenu === menu.id}
        tabindex={mi === activeMenuIndex ? 0 : -1}
        bind:this={menuLabelRefs[mi]}
        onclick={() => toggle(menu.id)}
        onfocus={() => (activeMenuIndex = mi)}
        onkeydown={(e) => onMenuLabelKeydown(e, mi)}
      >
        {menu.label}
      </button>
      {#if openMenu === menu.id}
        <div
          class="dropdown"
          role="menu"
          tabindex="-1"
          bind:this={dropdownEl}
          onkeydown={(e) => onDropdownKeydown(e, mi)}
        >
          {#each menu.items() as item, i (i)}
            {#if "separator" in item}
              <div class="separator"></div>
            {:else if "submenu" in item}
              <div
                class="submenu-trigger"
                class:disabled={item.disabled}
                role="menuitem"
                aria-haspopup="true"
                aria-expanded={submenuTrigger?.index === i}
                aria-disabled={item.disabled}
                tabindex="-1"
                data-index={i}
                onmouseenter={(e) => !item.disabled && openSubmenu(e, i)}
                onmouseleave={scheduleCloseSubmenu}
              >
                <span>{item.label}</span>
                <span class="arrow">▸</span>
                {#if submenuTrigger?.index === i}
                  <div
                    class="submenu"
                    role="menu"
                    tabindex="-1"
                    bind:this={submenuEl}
                    style="top: {submenuTrigger.top}px; left: {submenuTrigger.left}px;"
                    onmouseenter={cancelCloseSubmenu}
                    onmouseleave={scheduleCloseSubmenu}
                    onkeydown={(e) => onSubmenuKeydown(e, i)}
                  >
                    {#each item.submenu() as sub, j (j)}
                      {#if "separator" in sub}
                        <div class="separator"></div>
                      {:else if !("submenu" in sub)}
                        <button
                          class="item"
                          role="menuitem"
                          tabindex="-1"
                          disabled={sub.disabled}
                          onclick={() => run(sub.action)}
                        >
                          <span class="label-group">
                            <span class="check">{sub.checked ? "●" : ""}</span>
                            <span>{sub.label}</span>
                          </span>
                          {#if sub.shortcutId}
                            <span class="shortcut">{shortcutLabel(sub.shortcutId) ?? ""}</span>
                          {/if}
                        </button>
                      {/if}
                    {/each}
                  </div>
                {/if}
              </div>
            {:else}
              <button
                class="item"
                role="menuitem"
                tabindex="-1"
                disabled={item.disabled}
                onclick={() => run(item.action)}
              >
                <span>{item.label}</span>
                {#if item.shortcutId}
                  <span class="shortcut">{shortcutLabel(item.shortcutId) ?? ""}</span>
                {/if}
              </button>
            {/if}
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</nav>

{#if settingsRequest.open}
  {#await import("./SettingsDialog.svelte") then { default: SettingsDialog }}
    <SettingsDialog onClose={closeSettingsRequest} initialCategory={settingsRequest.category} />
  {/await}
{/if}

{#if projectSettingsRequest.open}
  {#await import("./ProjectSettingsDialog.svelte") then { default: ProjectSettingsDialog }}
    <ProjectSettingsDialog onClose={closeProjectSettingsRequest} initialCategory={projectSettingsRequest.category} />
  {/await}
{/if}

{#if showAbout}
  <AboutDialog onClose={() => (showAbout = false)} />
{/if}

{#if showCommandPrompt}
  {#await import("./CommandPrompt.svelte") then { default: CommandPrompt }}
    <CommandPrompt onClose={() => (showCommandPrompt = false)} />
  {/await}
{/if}

{#if showSearchEverywhere}
  {#await import("./SearchEverywhere.svelte") then { default: SearchEverywhere }}
    <SearchEverywhere onClose={() => (showSearchEverywhere = false)} />
  {/await}
{/if}

{#if showRecentFiles}
  {#await import("./RecentFiles.svelte") then { default: RecentFiles }}
    <RecentFiles onClose={() => (showRecentFiles = false)} />
  {/await}
{/if}

{#if exportRequest.open}
  {#await import("./ExportDialog.svelte") then { default: ExportDialog }}
    <ExportDialog onClose={closeExportRequest} initialFolder={exportRequest.folder} />
  {/await}
{/if}

{#if showGitCommit}
  {#await import("./GitCommitDialog.svelte") then { default: GitCommitDialog }}
    <GitCommitDialog onClose={() => (showGitCommit = false)} andPush={gitCommitAndPush} />
  {/await}
{/if}

<style>
  .menu-bar {
    display: flex;
    background: var(--color-bg-alt);
    border-bottom: 1px solid var(--color-border);
    font-size: 0.85rem;
    user-select: none;
    position: relative;
    z-index: 100;
  }

  .menu {
    position: relative;
  }

  .menu-label {
    background: none;
    border: none;
    padding: 0.35rem 0.7rem;
    cursor: pointer;
  }

  .menu-label.open {
    background: var(--color-accent);
    color: white;
  }

  .menu-label:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: -2px;
  }

  .dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    min-width: 16rem;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
    padding: 0.25rem 0;
    max-height: 70vh;
    overflow: auto;
  }

  .item {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    background: none;
    border: none;
    text-align: left;
    padding: 0.35rem 0.8rem;
    cursor: pointer;
    white-space: nowrap;
  }

  .item:hover:not(:disabled),
  .item:focus:not(:disabled) {
    background: var(--color-selected-bg);
    outline: none;
  }

  .item:disabled {
    color: var(--color-fg-muted);
    cursor: default;
  }

  .shortcut {
    color: var(--color-fg-muted);
    font-size: 0.75rem;
  }

  .separator {
    height: 1px;
    background: var(--color-border);
    margin: 0.25rem 0.5rem;
  }

  .label-group {
    display: flex;
    align-items: center;
  }

  .check {
    display: inline-block;
    width: 0.9rem;
  }

  /* Flyout submenus (Theme, Color Binder By) — mouse-only (no :hover on
     touch), same tradeoff BinderTree.svelte's context-menu flyouts make.
     `.submenu` is `position: fixed` with its top/left set inline from
     `submenuTrigger` (computed on mouseenter): the dropdown it lives in
     has `overflow: auto` so a long menu can scroll rather than run off
     the bottom of the screen, and that clips any absolutely-positioned
     descendant regardless of DOM nesting — `position: fixed` is what
     actually escapes it. */
  .submenu-trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.35rem 0.8rem;
    cursor: default;
  }

  .submenu-trigger:hover:not(.disabled),
  .submenu-trigger:focus:not(.disabled) {
    background: var(--color-selected-bg);
    outline: none;
  }

  .submenu-trigger.disabled {
    color: var(--color-fg-muted);
  }

  .submenu-trigger .arrow {
    color: var(--color-fg-muted);
    font-size: 0.75rem;
  }

  .submenu {
    position: fixed;
    min-width: 12rem;
    max-height: 70vh;
    overflow: auto;
    display: flex;
    flex-direction: column;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
    padding: 0.25rem 0;
    z-index: 200;
  }
</style>
