<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
  import { project, onTreeChange } from "./stores/project.svelte";
  import type { BinderColorMode, BinderNodeDto, FolderRole } from "./stores/project.svelte";
  import { showToast } from "./stores/toast.svelte";

  // The real egui app's full 5-category Project Settings panel
  // (app/src/ui/project_settings_panel.rs): Git, Sync, Binder, Attachments,
  // Daily Notes — plus Folder Roles and Status/POV colors, shown in this
  // same dialog there too. Left out of Attachments, deliberately: the
  // clipboard image paste size limit, a separate toggle this pass didn't
  // need to touch.
  let { onClose, initialCategory = null }: { onClose: () => void; initialCategory?: string | null } =
    $props();

  type Category = "Git" | "Sync" | "Binder" | "Attachments" | "DailyNotes" | "FolderRoles" | "Colors";
  const categories: Category[] = [
    "Git",
    "Sync",
    "Binder",
    "Attachments",
    "DailyNotes",
    "FolderRoles",
    "Colors",
  ];
  // svelte-ignore state_referenced_locally -- deliberately a one-time read:
  // this dialog is remounted fresh each time it opens, so `active` should
  // seed from whatever category the opener asked for, not keep tracking it.
  let active = $state<Category>(
    initialCategory && (categories as string[]).includes(initialCategory)
      ? (initialCategory as Category)
      : "Binder",
  );

  let categoryRefs: (HTMLButtonElement | null)[] = [];

  // Without this, keyboard focus starts outside .modal entirely, so
  // Up/Down wouldn't do anything until an extra, unrelated Tab press
  // happened to land on a category button — see SettingsDialog.svelte's
  // own copy of this fix for the full explanation.
  onMount(() => {
    categoryRefs[categories.indexOf(active)]?.focus();
  });

  // Roving-tabindex vertical tablist for the category sidebar (Up/Down/
  // Left/Right/Home/End) — same pattern MenuBar.svelte's own dropdowns and
  // SettingsDialog.svelte's own category list use.
  function handleCategoryNavKeydown(e: KeyboardEvent) {
    if (!categoryRefs.includes(document.activeElement as HTMLButtonElement)) return;
    const current = categories.indexOf(active);
    let next: number;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = (current + 1) % categories.length;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      next = (current - 1 + categories.length) % categories.length;
    } else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = categories.length - 1;
    else return;
    e.preventDefault();
    active = categories[next];
    categoryRefs[next]?.focus();
  }

  type FolderRoleEntry = { path: string; role: FolderRole };
  type AttachmentDestination = "SameAsDocument" | "ConfiguredFolder";
  type ProjectSettings = {
    binder_color_mode: BinderColorMode;
    daily_notes_enabled: boolean;
    daily_notes_folder: string;
    daily_note_filename_format: string;
    daily_note_template: string | null;
    folder_roles: FolderRoleEntry[];
    status_colors: Record<string, string>;
    pov_colors: Record<string, string>;
    git_enabled: boolean;
    git_auto_commit_enabled: boolean;
    git_auto_commit_interval_minutes: number;
    git_auto_commit_push_enabled: boolean;
    sync_files: boolean;
    attachment_destination: AttachmentDestination;
    attachments_folder: string | null;
  };

  let settings = $state<ProjectSettings | null>(null);
  let error = $state<string | null>(null);

  type TemplateDocument = { path: string; name: string };
  let templateDocuments = $state<TemplateDocument[]>([]);

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
      templateDocuments = await invoke<TemplateDocument[]>("template_documents", {
        root: project.value.root,
      });
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

  async function setDailyNoteTemplate(path: string | null) {
    if (!project.value || !settings) return;
    try {
      await invoke("set_daily_note_template", { root: project.value.root, path });
      settings.daily_note_template = path;
    } catch (err) {
      showToast(String(err));
    }
  }

  async function saveGitAutoCommit() {
    if (!project.value || !settings) return;
    try {
      await invoke("set_git_auto_commit", {
        root: project.value.root,
        enabled: settings.git_auto_commit_enabled,
        intervalMinutes: settings.git_auto_commit_interval_minutes,
        pushEnabled: settings.git_auto_commit_push_enabled,
      });
    } catch (err) {
      showToast(String(err));
    }
  }

  async function saveSyncFiles() {
    if (!project.value || !settings) return;
    try {
      await invoke("set_sync_files", { root: project.value.root, enabled: settings.sync_files });
    } catch (err) {
      showToast(String(err));
    }
  }

  async function setAttachmentDestination(destination: AttachmentDestination) {
    if (!project.value || !settings) return;
    try {
      await invoke("set_attachment_destination", { root: project.value.root, destination });
      settings.attachment_destination = destination;
    } catch (err) {
      showToast(String(err));
    }
  }

  async function pickAttachmentsFolder() {
    if (!project.value || !settings) return;
    const picked = await openFolderDialog({ directory: true, defaultPath: project.value.root });
    if (typeof picked !== "string") return;
    try {
      await invoke("set_attachments_folder", { root: project.value.root, path: picked });
      settings.attachments_folder = picked;
    } catch (err) {
      showToast(String(err));
    }
  }

  async function clearAttachmentsFolder() {
    if (!project.value || !settings) return;
    try {
      await invoke("set_attachments_folder", { root: project.value.root, path: null });
      settings.attachments_folder = null;
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
    onkeydown={(e) => {
      if (e.key === "Escape") onClose();
      else handleCategoryNavKeydown(e);
    }}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div class="layout">
      <nav class="categories">
        {#each categories as category, i (category)}
          <button
            class:active={active === category}
            role="tab"
            aria-selected={active === category}
            tabindex={active === category ? 0 : -1}
            bind:this={categoryRefs[i]}
            onclick={() => {
              active = category;
              categoryRefs[i]?.focus();
            }}
          >
            {category === "DailyNotes" ? "Daily Notes" : category === "FolderRoles" ? "Folder Roles" : category}
          </button>
        {/each}
      </nav>
      <div class="content">
        {#if error}
          <p class="error">{error}</p>
        {:else if !settings}
          <p>Loading…</p>
        {:else if active === "Git"}
          {#if !settings.git_enabled}
            <p class="note">Enable git support for this project from the Versions menu first.</p>
          {:else}
            <label class="row">
              <input
                type="checkbox"
                bind:checked={settings.git_auto_commit_enabled}
                onchange={saveGitAutoCommit}
              />
              Automatically commit changes
            </label>
            <label class="row" class:disabled={!settings.git_auto_commit_enabled}>
              Every
              <input
                type="number"
                min="1"
                max="1440"
                disabled={!settings.git_auto_commit_enabled}
                bind:value={settings.git_auto_commit_interval_minutes}
                onchange={saveGitAutoCommit}
              />
              minutes
            </label>
            <label class="row" class:disabled={!settings.git_auto_commit_enabled}>
              <input
                type="checkbox"
                disabled={!settings.git_auto_commit_enabled}
                bind:checked={settings.git_auto_commit_push_enabled}
                onchange={saveGitAutoCommit}
              />
              Push after each automatic commit
            </label>
          {/if}
        {:else if active === "Sync"}
          <label class="row">
            <input type="checkbox" bind:checked={settings.sync_files} onchange={saveSyncFiles} />
            Also sync images, PDFs and other files
          </label>
          <p class="note">
            Every other file in the project folder, whole, up to the server's size limit. A
            project setting: it applies on every device syncing this project. Pairing, live
            status and devices are managed from the Sync dock tab.
          </p>
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
        {:else if active === "Attachments"}
          <p class="note">Save pasted/dropped images and files:</p>
          <label class="row">
            <input
              type="radio"
              name="attachment-destination"
              checked={settings.attachment_destination === "SameAsDocument"}
              onchange={() => setAttachmentDestination("SameAsDocument")}
            />
            In the same folder as the document
          </label>
          <label class="row">
            <input
              type="radio"
              name="attachment-destination"
              checked={settings.attachment_destination === "ConfiguredFolder"}
              onchange={() => setAttachmentDestination("ConfiguredFolder")}
            />
            In a specific folder
          </label>
          {#if settings.attachment_destination === "ConfiguredFolder"}
            <label class="row">
              <input type="text" readonly value={settings.attachments_folder ?? "(not set)"} />
              <button onclick={pickAttachmentsFolder}>Browse…</button>
              {#if settings.attachments_folder}
                <button onclick={clearAttachmentsFolder}>Reset</button>
              {/if}
            </label>
          {/if}
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
          <label class="row">
            Template
            <select
              value={settings.daily_note_template ?? ""}
              onchange={(e) => setDailyNoteTemplate(e.currentTarget.value || null)}
            >
              <option value="">(None — blank note)</option>
              {#each templateDocuments as doc (doc.path)}
                <option value={doc.path}>{doc.name}</option>
              {/each}
            </select>
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

  .categories button:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: -2px;
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

  .row.disabled {
    opacity: 0.5;
  }

  .row input[type="number"] {
    width: 4.5rem;
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
