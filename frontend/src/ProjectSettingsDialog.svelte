<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { project, onTreeChange } from "./stores/project.svelte";
  import type { BinderColorMode, BinderNodeDto, FolderRole } from "./stores/project.svelte";
  import { showToast } from "./stores/toast.svelte";

  // A bounded subset of the real egui app's 5-category Project Settings
  // panel (app/src/ui/project_settings_panel.rs): Binder, Daily Notes,
  // Folder Roles, and Status/POV colors. Left out: Git auto-commit config,
  // the Sync "also sync non-text files" toggle, Attachments destination,
  // and the Daily Notes template picker — each its own chunk of core
  // methods with no existing command either, same shape as what's here,
  // just not wired yet.
  let { onClose }: { onClose: () => void } = $props();

  type Category = "Binder" | "DailyNotes" | "FolderRoles" | "Colors";
  const categories: Category[] = ["Binder", "DailyNotes", "FolderRoles", "Colors"];
  let active = $state<Category>("Binder");

  type FolderRoleEntry = { path: string; role: FolderRole };
  type ProjectSettings = {
    binder_color_mode: BinderColorMode;
    daily_notes_enabled: boolean;
    daily_notes_folder: string;
    daily_note_filename_format: string;
    folder_roles: FolderRoleEntry[];
    status_colors: Record<string, string>;
    pov_colors: Record<string, string>;
  };

  let settings = $state<ProjectSettings | null>(null);
  let error = $state<string | null>(null);

  const BINDER_COLOR_MODES: BinderColorMode[] = ["Off", "Status", "Pov", "WordCountProgress"];
  const BINDER_COLOR_MODE_LABELS: Record<BinderColorMode, string> = {
    Off: "Off",
    Status: "Status",
    Pov: "POV",
    WordCountProgress: "Word Count",
  };

  const FOLDER_ROLES: FolderRole[] = ["Research", "Trash", "Templates", "Manuscript", "World"];

  async function loadSettings() {
    if (!project.value) return;
    try {
      settings = await invoke<ProjectSettings>("project_settings", { root: project.value.root });
    } catch (err) {
      error = String(err);
    }
  }
  loadSettings();

  function folderPaths(node: BinderNodeDto, out: { path: string; name: string }[]) {
    if (node.kind === "Folder") {
      out.push({ path: node.path, name: node.name });
      for (const child of node.children) folderPaths(child, out);
    }
  }

  const folders = $derived.by(() => {
    const out: { path: string; name: string }[] = [];
    if (project.value) folderPaths(project.value.tree, out);
    return out;
  });

  function roleFor(path: string): FolderRole | "" {
    return settings?.folder_roles.find((r) => r.path === path)?.role ?? "";
  }

  async function setBinderColorMode(mode: BinderColorMode) {
    if (!project.value || !settings) return;
    try {
      const result = await invoke<{ binder_color_mode: BinderColorMode; tree: BinderNodeDto }>(
        "set_binder_color_mode",
        { root: project.value.root, mode },
      );
      settings.binder_color_mode = result.binder_color_mode;
      project.value.binder_color_mode = result.binder_color_mode;
      onTreeChange(result.tree);
    } catch (err) {
      showToast(String(err));
    }
  }

  async function saveDailyNotes() {
    if (!project.value || !settings) return;
    try {
      await invoke("set_project_daily_notes", {
        root: project.value.root,
        enabled: settings.daily_notes_enabled,
        folder: settings.daily_notes_folder,
        filenameFormat: settings.daily_note_filename_format,
      });
    } catch (err) {
      showToast(String(err));
    }
  }

  async function setRole(path: string, role: string) {
    if (!project.value) return;
    try {
      await invoke("set_folder_role", { root: project.value.root, path, role: role || null });
      await loadSettings();
    } catch (err) {
      showToast(String(err));
    }
  }

  let newStatus = $state("");
  let newStatusColor = $state("#888888");
  let newPov = $state("");
  let newPovColor = $state("#888888");

  async function addStatusColor() {
    if (!project.value || !newStatus.trim()) return;
    await invoke("set_status_color", { root: project.value.root, status: newStatus, hex: newStatusColor });
    newStatus = "";
    await loadSettings();
  }

  async function removeStatusColor(status: string) {
    if (!project.value) return;
    await invoke("clear_status_color", { root: project.value.root, status });
    await loadSettings();
  }

  async function addPovColor() {
    if (!project.value || !newPov.trim()) return;
    await invoke("set_pov_color", { root: project.value.root, pov: newPov, hex: newPovColor });
    newPov = "";
    await loadSettings();
  }

  async function removePovColor(pov: string) {
    if (!project.value) return;
    await invoke("clear_pov_color", { root: project.value.root, pov });
    await loadSettings();
  }
</script>

<div class="backdrop" onclick={onClose} role="presentation">
  <div
    class="modal"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.key === "Escape" && onClose()}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div class="layout">
      <nav class="categories">
        {#each categories as category (category)}
          <button class:active={active === category} onclick={() => (active = category)}>
            {category === "DailyNotes" ? "Daily Notes" : category === "FolderRoles" ? "Folder Roles" : category}
          </button>
        {/each}
      </nav>
      <div class="content">
        {#if error}
          <p class="error">{error}</p>
        {:else if !settings}
          <p>Loading…</p>
        {:else if active === "Binder"}
          <p class="note">Which value colors each Binder row.</p>
          {#each BINDER_COLOR_MODES as mode (mode)}
            <label class="row">
              <input
                type="radio"
                name="binder-color-mode"
                checked={settings.binder_color_mode === mode}
                onchange={() => setBinderColorMode(mode)}
              />
              {BINDER_COLOR_MODE_LABELS[mode]}
            </label>
          {/each}
        {:else if active === "DailyNotes"}
          <label class="row">
            <input type="checkbox" bind:checked={settings.daily_notes_enabled} onchange={saveDailyNotes} />
            Enable Daily Notes
          </label>
          <label class="row">
            Folder (strftime codes allowed, e.g. "Journal/%Y/%m")
            <input type="text" bind:value={settings.daily_notes_folder} onchange={saveDailyNotes} />
          </label>
          <label class="row">
            Filename format
            <input type="text" bind:value={settings.daily_note_filename_format} onchange={saveDailyNotes} />
          </label>
        {:else if active === "FolderRoles"}
          <p class="note">Research/Trash/Templates/World: at most one folder at a time. Manuscript: any number.</p>
          <ul class="folder-list">
            {#each folders as folder (folder.path)}
              <li>
                <span>{folder.name}</span>
                <select value={roleFor(folder.path)} onchange={(e) => setRole(folder.path, e.currentTarget.value)}>
                  <option value="">None</option>
                  {#each FOLDER_ROLES as role (role)}
                    <option value={role}>{role}</option>
                  {/each}
                </select>
              </li>
            {/each}
          </ul>
        {:else if active === "Colors"}
          <h4>Status Colors</h4>
          <ul class="color-list">
            {#each Object.entries(settings.status_colors) as [status, hex] (status)}
              <li>
                <span class="swatch" style="background: {hex};"></span>
                <span class="label">{status}</span>
                <button onclick={() => removeStatusColor(status)}>Remove</button>
              </li>
            {/each}
          </ul>
          <div class="add-row">
            <input type="text" placeholder="Status name" bind:value={newStatus} />
            <input type="color" bind:value={newStatusColor} />
            <button onclick={addStatusColor}>Add</button>
          </div>
          <h4>POV Colors</h4>
          <ul class="color-list">
            {#each Object.entries(settings.pov_colors) as [pov, hex] (pov)}
              <li>
                <span class="swatch" style="background: {hex};"></span>
                <span class="label">{pov}</span>
                <button onclick={() => removePovColor(pov)}>Remove</button>
              </li>
            {/each}
          </ul>
          <div class="add-row">
            <input type="text" placeholder="POV name" bind:value={newPov} />
            <input type="color" bind:value={newPovColor} />
            <button onclick={addPovColor}>Add</button>
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    width: 36rem;
    max-width: 95vw;
    height: 480px;
    max-height: 90vh;
    background: var(--color-bg);
    border-radius: 6px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
  }

  .layout {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  .categories {
    width: 140px;
    border-right: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    padding: 0.5rem 0;
    overflow: auto;
  }

  .categories button {
    text-align: left;
    background: none;
    border: none;
    padding: 0.4rem 0.75rem;
    cursor: pointer;
    font-size: 0.85rem;
  }

  .categories button.active {
    background: var(--color-accent);
    color: white;
  }

  .content {
    flex: 1;
    overflow: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
  }

  .note {
    font-size: 0.8rem;
    color: var(--color-fg-muted);
    font-style: italic;
    margin: 0;
  }

  .error {
    color: var(--color-danger);
  }

  h4 {
    margin: 0.5rem 0 0.25rem;
    font-size: 0.85rem;
  }

  .folder-list,
  .color-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .folder-list li,
  .color-list li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0;
    border-bottom: 1px solid var(--color-border);
    font-size: 0.85rem;
  }

  .folder-list li span {
    flex: 1;
  }

  .color-list .label {
    flex: 1;
  }

  .swatch {
    display: inline-block;
    width: 0.9rem;
    height: 0.9rem;
    border-radius: 3px;
    border: 1px solid var(--color-border);
  }

  .add-row {
    display: flex;
    gap: 0.4rem;
    align-items: center;
  }

  .add-row input[type="text"] {
    flex: 1;
  }
</style>
