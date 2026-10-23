<script lang="ts">
  import { onMount } from "svelte";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
  import { invoke } from "@tauri-apps/api/core";
  import {
    project,
    closeProject,
    openProject,
    createProject,
    openFindReplace,
  } from "./stores/project.svelte";
  import AboutDialog from "./AboutDialog.svelte";
  import { dockLayoutRegistry } from "./stores/dockLayoutRegistry.svelte";
  import { settingsStore, saveSettingsDebounced } from "./stores/settings.svelte";
  import { SHORTCUT_ACTIONS, effectiveCombo, runShortcutAction, registerShortcutHandler } from "./shortcuts";
  import { notImplemented, showToast } from "./stores/toast.svelte";
  import { applyTheme } from "./stores/theme.svelte";

  // Desktop menu bar matching the real egui app's 8-menu structure
  // (app/src/app/menu_bar.rs) as closely as this port's actual
  // functionality allows. Every item from that file is represented; most
  // now call a real action — Export, Find & Replace, Command Prompt,
  // Search Everywhere, git Commit/Push/Pull/Commit+Push, saved named
  // Layouts, About, and docx/epub/PDF/Scrivener Import were all stubbed
  // notImplemented() placeholders until this pass, listed for structural
  // fidelity first and wired for real once a user asked for them.
  //
  // Still genuinely stubbed, deliberately: Recent Projects (a whole
  // submenu UI, out of this pass's scope) and Reload Plugins/Enable
  // Project Plugins — that one is different in kind, not just unfinished:
  // there is no plugin engine anywhere in this Tauri port (no Rhai
  // scripting, no :command registration), so there's nothing to reload.
  // It's left as a clear "no plugin engine in this build" message rather
  // than faked as if a real action were just missing its wiring.
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
  // Submenus (Recent Projects, Import's per-format choice, Color Binder
  // By) are flattened or replaced with a native file-picker's own format
  // filter rather than built as true nested flyouts — a scope cut.
  let openMenu = $state<string | null>(null);

  type Item =
    | { separator: true }
    | {
        label: string;
        shortcutId?: string;
        action: () => void;
        disabled?: boolean;
        hidden?: boolean;
      };

  function toggle(menu: string) {
    openMenu = openMenu === menu ? null : menu;
  }

  function close() {
    openMenu = null;
  }

  function run(action: () => void) {
    action();
    close();
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
    const name = window.prompt("New project name:");
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
    const name = window.prompt("Save current layout as:");
    if (!name) return;
    dockLayoutRegistry.api?.saveCurrentLayoutAs(name);
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

  const menus: { id: string; label: string; items: () => Item[] }[] = [
    {
      id: "file",
      label: "File",
      items: () => [
        { label: "New Project…", action: pickAndCreateProject },
        { label: "Open Project…", action: pickAndOpenProject },
        { label: "Recent Projects", action: () => notImplemented("Recent Projects") },
        { label: "Close Project", action: closeProject, disabled: !hasProject },
        { separator: true },
        { label: "Open Document…", action: () => runShortcutAction("open_document") },
        { label: "Search Everywhere…", action: () => runShortcutAction("search_everywhere") },
        { label: "Recent Files…", action: () => runShortcutAction("recent_files") },
        { label: "Close Document", action: () => runShortcutAction("close_document") },
        { label: "Go Back", action: () => runShortcutAction("go_back") },
        { label: "Go Forward", action: () => runShortcutAction("go_forward") },
        { separator: true },
        { label: "Import Word Document (.docx)…", action: () => pickAndImport("docx") },
        { label: "Import EPUB (.epub)…", action: () => pickAndImport("epub") },
        { label: "Import PDF (.pdf)…", action: () => pickAndImport("pdf") },
        { label: "Import Scrivener Project…", action: pickAndImportScrivener },
        { label: "Export Manuscript…", action: () => (showExport = true), disabled: !hasProject },
        { separator: true },
        { label: "Settings…", action: () => (showSettings = true) },
        {
          label: "Project Settings…",
          action: () => (showProjectSettings = true),
          disabled: !hasProject,
        },
        { separator: true },
        { label: "Exit", action: () => runShortcutAction("exit") },
      ],
    },
    {
      id: "edit",
      label: "Edit",
      items: () => [
        { label: "Cut", action: () => document.execCommand("cut") },
        { label: "Copy", action: () => document.execCommand("copy") },
        { label: "Paste", action: () => document.execCommand("paste") },
        { separator: true },
        { label: "Find and Replace", action: () => runShortcutAction("find_replace") },
      ],
    },
    {
      id: "view",
      label: "View",
      items: () => [
        { label: "Editor", action: () => dock("editor") },
        { label: "Preview", shortcutId: "toggle_preview", action: () => dock("preview") },
        { label: "Corkboard", shortcutId: "toggle_corkboard", action: () => dock("corkboard") },
        { label: "Story Grid", shortcutId: "toggle_story_grid", action: () => dock("storygrid") },
        {
          label: "Belief Timeline",
          shortcutId: "toggle_belief_timeline",
          action: () => dock("belieftimeline"),
        },
        { separator: true },
        { label: "Binder", action: () => dock("binder") },
        { label: "Metadata", shortcutId: "edit_metadata", action: () => dock("metadata") },
        { label: "Backlinks", shortcutId: "toggle_backlinks", action: () => dock("backlinks") },
        { label: "Tags", shortcutId: "toggle_tags", action: () => dock("tags") },
        { separator: true },
        ...themeItems(),
      ],
    },
    {
      id: "tools",
      label: "Tools",
      items: () => [
        { label: "Focus Mode", action: () => runShortcutAction("toggle_focus_mode") },
        { label: "Toggle Spell Check", action: () => runShortcutAction("toggle_spell_check") },
        { separator: true },
        { label: "Command Prompt", action: () => runShortcutAction("command_prompt") },
        { label: "Pomodoro Timer", action: () => dock("pomodoro") },
        { label: "Word Count", action: () => dock("wordcount") },
        { label: "Streak", action: () => dock("streak") },
        { label: "Dashboard", action: () => dock("dashboard") },
        { label: "Bookmarks", action: () => dock("bookmarks") },
        { label: "Notes", action: () => dock("notes") },
        { separator: true },
        { label: "Sync Panel", action: () => dock("sync") },
        { label: "Sync Now", action: () => runShortcutAction("sync_now") },
        { separator: true },
        { label: "Reload Plugins", action: reloadPlugins },
        { label: "Enable Project Plugins", action: reloadPlugins },
      ],
    },
    {
      id: "versions",
      label: "Versions",
      items: () => [
        { label: "Commit", action: () => runShortcutAction("git_commit"), disabled: !hasProject },
        {
          label: "Commit and Push",
          action: () => runShortcutAction("git_commit_and_push"),
          disabled: !hasProject,
        },
        { label: "Push", action: () => runShortcutAction("git_push"), disabled: !hasProject },
        { label: "Pull", action: () => runShortcutAction("git_pull"), disabled: !hasProject },
        { separator: true },
        { label: "Version Activity", action: () => dock("versionactivity") },
      ],
    },
    {
      id: "collaborate",
      label: "Collaborate",
      items: () => [
        { label: "Host Session", action: () => dock("collab") },
        { label: "Join Session…", action: () => dock("collab") },
        { label: "End Session", action: () => dock("collab") },
        { separator: true },
        { label: "Collaboration Panel", action: () => dock("collab") },
      ],
    },
    {
      id: "window",
      label: "Window",
      items: () => [
        { label: "Save Current Layout…", action: saveCurrentLayout },
        { label: "Layouts", action: () => {}, disabled: true },
        ...layoutItems(),
        { separator: true },
        {
          label: "Restore Default Layout",
          action: () => dockLayoutRegistry.api?.resetLayout(),
        },
      ],
    },
    {
      id: "help",
      label: "Help",
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

  function themeItems(): Item[] {
    const items: Item[] = [{ label: "Theme: Default", action: () => setTheme(null) }];
    for (const theme of settingsStore.colorThemes) {
      items.push({ label: `Theme: ${theme.label}`, action: () => setTheme(theme.id) });
    }
    return items;
  }

  function setTheme(id: string | null) {
    settingsStore.value.color_theme = id;
    settingsStore.value = { ...settingsStore.value };
    saveSettingsDebounced();
    applyTheme();
  }

  let showSettings = $state(false);
  let showProjectSettings = $state(false);
  let showAbout = $state(false);
  let showCommandPrompt = $state(false);
  let showSearchEverywhere = $state(false);
  let showRecentFiles = $state(false);
  let showExport = $state(false);
  let showGitCommit = $state(false);
  let gitCommitAndPush = $state(false);

  onMount(() => {
    registerShortcutHandler("new_project", pickAndCreateProject);
    registerShortcutHandler("open_project", pickAndOpenProject);
    registerShortcutHandler("close_project", closeProject);
    registerShortcutHandler("open_settings", () => (showSettings = true));
    registerShortcutHandler("open_project_settings", () => {
      if (project.value) showProjectSettings = true;
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

<svelte:window onclick={handleWindowClick} onkeydown={(e) => e.key === "Escape" && close()} />

<nav class="menu-bar">
  {#each menus as menu (menu.id)}
    <div class="menu">
      <button class="menu-label" class:open={openMenu === menu.id} onclick={() => toggle(menu.id)}>
        {menu.label}
      </button>
      {#if openMenu === menu.id}
        <div class="dropdown">
          {#each menu.items() as item, i (i)}
            {#if "separator" in item}
              <div class="separator"></div>
            {:else}
              <button
                class="item"
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

{#if showSettings}
  {#await import("./SettingsDialog.svelte") then { default: SettingsDialog }}
    <SettingsDialog onClose={() => (showSettings = false)} />
  {/await}
{/if}

{#if showProjectSettings}
  {#await import("./ProjectSettingsDialog.svelte") then { default: ProjectSettingsDialog }}
    <ProjectSettingsDialog onClose={() => (showProjectSettings = false)} />
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

{#if showExport}
  {#await import("./ExportDialog.svelte") then { default: ExportDialog }}
    <ExportDialog onClose={() => (showExport = false)} />
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

  .item:hover:not(:disabled) {
    background: var(--color-selected-bg);
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
</style>
