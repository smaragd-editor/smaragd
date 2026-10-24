<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
  import { settingsStore, saveSettingsDebounced, refreshSpellCheckCatalog } from "./stores/settings.svelte";
  import { SHORTCUT_ACTIONS, SHORTCUT_CATEGORIES, effectiveCombo, setShortcut } from "./shortcuts";
  import type { KeyCombo } from "./stores/settings.svelte";
  import { applyTheme } from "./stores/theme.svelte";
  import { recheckSpelling } from "./stores/project.svelte";

  // Settings dialog matching the real egui app's 9-category structure
  // (app/src/ui/settings_panel.rs) — General, Appearance, Editor,
  // SpellCheck, Templates, Versions, Sync, Pomodoro, Shortcuts, in that
  // order. Every field here is real (persists through core::settings::
  // Settings via settings_save) but a couple don't have a functional
  // consumer in this build yet — Sync is a placeholder for exactly that
  // reason (no real sync pairing — Phase 6's Sync panel is demo-only),
  // noted inline rather than silently omitted, same as every other scope
  // cut in this port. Spell Check now has a real one.
  let { onClose, initialCategory = null }: { onClose: () => void; initialCategory?: string | null } =
    $props();

  let downloading = $state<string | null>(null);

  async function downloadDictionary(language: string) {
    downloading = language;
    try {
      await invoke("spell_check_download", { language });
      await refreshSpellCheckCatalog();
    } catch (err) {
      alert(`Couldn't download: ${err}`);
    } finally {
      downloading = null;
    }
  }

  function changeSpellCheckLanguage() {
    update();
    recheckSpelling();
  }

  type Category =
    | "General"
    | "Appearance"
    | "Editor"
    | "SpellCheck"
    | "Templates"
    | "Versions"
    | "Sync"
    | "Pomodoro"
    | "Shortcuts";

  const categories: Category[] = [
    "General",
    "Appearance",
    "Editor",
    "SpellCheck",
    "Templates",
    "Versions",
    "Sync",
    "Pomodoro",
    "Shortcuts",
  ];

  // svelte-ignore state_referenced_locally -- deliberately a one-time read:
  // this dialog is remounted fresh each time it opens, so `active` should
  // seed from whatever category the opener asked for, not keep tracking it.
  let active = $state<Category>(
    initialCategory && (categories as string[]).includes(initialCategory)
      ? (initialCategory as Category)
      : "General",
  );

  function update() {
    settingsStore.value = { ...settingsStore.value };
    saveSettingsDebounced();
    applyTheme();
  }

  let categoryRefs: (HTMLButtonElement | null)[] = [];

  // Without this, keyboard focus starts outside .modal entirely (wherever
  // it was before the dialog opened), so Up/Down wouldn't do anything —
  // handleCategoryNavKeydown only reacts once a category button already
  // has focus — until an extra, unrelated Tab press happened to land on
  // one. Focusing the active category immediately makes arrow-key
  // navigation work the moment the dialog opens.
  onMount(() => {
    categoryRefs[categories.indexOf(active)]?.focus();
  });

  let defaultBackupDir = $state<string | null>(null);
  onMount(async () => {
    defaultBackupDir = await invoke<string | null>("backup_default_dir");
  });

  async function pickBackupDir() {
    const picked = await openFileDialog({ directory: true, multiple: false });
    if (typeof picked === "string") {
      settingsStore.value.backup_dir = picked;
      update();
    }
  }

  function resetBackupDir() {
    settingsStore.value.backup_dir = null;
    update();
  }

  // Roving-tabindex vertical tablist for the category sidebar (Up/Down/
  // Left/Right/Home/End) — same pattern MenuBar.svelte's own dropdowns use.
  // Returns true if it handled the key, so handleModalKeydown knows not to
  // fall through to anything else.
  function handleCategoryNavKeydown(e: KeyboardEvent): boolean {
    if (!categoryRefs.includes(document.activeElement as HTMLButtonElement)) return false;
    const current = categories.indexOf(active);
    let next: number;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = (current + 1) % categories.length;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      next = (current - 1 + categories.length) % categories.length;
    } else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = categories.length - 1;
    else return false;
    e.preventDefault();
    active = categories[next];
    categoryRefs[next]?.focus();
    return true;
  }

  // Everything keyboard-related for this dialog funnels through here
  // (rather than a <svelte:window> listener) and always stops propagation —
  // both so a shortcut-recording key combo (which can be anything,
  // including Alt+<menu mnemonic>) never also reaches MenuBar's own
  // window-level Alt+<letter> handling behind this dialog, and so Escape
  // reliably reaches *this* handler itself: a <svelte:window> listener
  // wouldn't, since .modal previously called stopPropagation()
  // unconditionally on every keydown, which — being on an ancestor of
  // wherever focus actually was — blocked the event from ever bubbling up
  // to window in the first place.
  function handleModalKeydown(e: KeyboardEvent) {
    e.stopPropagation();
    if (recordingFor) {
      onRecordKeydown(e);
      return;
    }
    if (e.key === "Escape") {
      onClose();
      return;
    }
    handleCategoryNavKeydown(e);
  }

  let recordingFor = $state<string | null>(null);

  function startRecording(actionId: string) {
    recordingFor = actionId;
  }

  function onRecordKeydown(e: KeyboardEvent) {
    if (!recordingFor) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") {
      recordingFor = null;
      return;
    }
    // Skip a bare modifier press — wait for the real key, same as the real
    // app's recording modal.
    if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
    if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      // Real app rejects unmodified printable keys (function keys/Escape
      // exempt) — simplified here to: require at least one modifier, or a
      // function key.
      if (!/^F\d{1,2}$/.test(e.key)) return;
    }
    const combo: KeyCombo = {
      key: e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase(),
      ctrl_or_cmd: e.ctrlKey || e.metaKey,
      shift: e.shiftKey,
      alt: e.altKey,
    };
    setShortcut(recordingFor, combo);
    recordingFor = null;
  }

  function comboLabel(combo: KeyCombo | undefined): string {
    if (!combo || combo.key === "") return "Unbound";
    const mod = combo.ctrl_or_cmd ? "Ctrl+" : "";
    const alt = combo.alt ? "Alt+" : "";
    const shift = combo.shift ? "Shift+" : "";
    return `${mod}${alt}${shift}${combo.key.toUpperCase()}`;
  }
</script>

<div class="backdrop" onclick={onClose} role="presentation">
  <div
    class="modal"
    onclick={(e) => e.stopPropagation()}
    onkeydown={handleModalKeydown}
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
            {category}
          </button>
        {/each}
      </nav>
      <div class="content">
        {#if active === "General"}
          <label class="row">
            <input type="checkbox" bind:checked={settingsStore.value.reopen_last_project} onchange={update} />
            Reopen project on launch
          </label>
          <label class="row">
            <input
              type="checkbox"
              bind:checked={settingsStore.value.create_starter_folders}
              onchange={update}
            />
            Ensure Research and Trash folders exist in every project
          </label>
          <label class="row">
            <input
              type="checkbox"
              bind:checked={settingsStore.value.show_document_stats_in_binder}
              onchange={update}
            />
            Show lines/words/chars next to each document in the Binder
          </label>
          <label class="row">
            <input
              type="checkbox"
              checked={!settingsStore.value.hide_window_button_bar}
              onchange={(e) => {
                settingsStore.value.hide_window_button_bar = !e.currentTarget.checked;
                update();
              }}
            />
            Show the Window button bar above the dock
          </label>
          <label class="row">
            <input
              type="checkbox"
              checked={!settingsStore.value.double_shift_search_disabled}
              onchange={(e) => {
                settingsStore.value.double_shift_search_disabled = !e.currentTarget.checked;
                update();
              }}
            />
            Double-tap Shift to open Search Everywhere
          </label>
        {:else if active === "Appearance"}
          <label class="row">
            Theme
            <select bind:value={settingsStore.value.theme_preference} onchange={update}>
              <option value="system">System</option>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </label>
          <label class="row">
            Color theme
            <select bind:value={settingsStore.value.color_theme} onchange={update}>
              <option value={null}>Default</option>
              {#each settingsStore.colorThemes as theme (theme.id)}
                <option value={theme.id}>{theme.label}</option>
              {/each}
            </select>
          </label>
          <label class="row">
            UI font
            <select bind:value={settingsStore.value.ui_font} onchange={update}>
              <option value="Proportional">Proportional</option>
              <option value="Monospace">Monospace</option>
              <option value="LibertinusSerif">Libertinus Serif</option>
              <option value="DejaVuSansMono">DejaVu Sans Mono</option>
              <option value="AtkinsonHyperlegible">Atkinson Hyperlegible</option>
            </select>
          </label>
          <label class="row">
            UI scale (%)
            <input
              type="number"
              min="50"
              max="300"
              placeholder="auto"
              value={settingsStore.value.ui_scale ? Math.round(settingsStore.value.ui_scale * 100) : ""}
              oninput={(e) => {
                const v = Number((e.target as HTMLInputElement).value);
                settingsStore.value.ui_scale = v ? v / 100 : 0;
                update();
              }}
            />
          </label>
        {:else if active === "Editor"}
          <label class="row">
            Editor font
            <select bind:value={settingsStore.value.editor_font} onchange={update}>
              <option value="Proportional">Proportional</option>
              <option value="Monospace">Monospace</option>
              <option value="LibertinusSerif">Libertinus Serif</option>
              <option value="DejaVuSansMono">DejaVu Sans Mono</option>
              <option value="AtkinsonHyperlegible">Atkinson Hyperlegible</option>
            </select>
          </label>
          <label class="row">
            Size (pt)
            <input
              type="number"
              min="8"
              max="48"
              placeholder="14"
              value={settingsStore.value.editor_font_size || ""}
              oninput={(e) => {
                settingsStore.value.editor_font_size = Number(
                  (e.target as HTMLInputElement).value,
                );
                update();
              }}
            />
          </label>
          <label class="row">
            <input
              type="checkbox"
              bind:checked={settingsStore.value.typewriter_quotes}
              onchange={update}
            />
            Typewriter quotes in Preview and export
          </label>
          <label class="row">
            <input
              type="checkbox"
              bind:checked={settingsStore.value.show_editor_gutter}
              onchange={update}
            />
            Show line numbers
          </label>
          <label class="row">
            <input type="checkbox" bind:checked={settingsStore.value.multi_tab_editor} onchange={update} />
            Allow multiple documents open at once
          </label>
          <p class="note">
            Not yet wired to the Editor panel itself in this build — these persist but don't
            change its behavior yet.
          </p>
        {:else if active === "SpellCheck"}
          <label class="row">
            Language
            <select bind:value={settingsStore.value.spell_check_language} onchange={changeSpellCheckLanguage}>
              {#each settingsStore.spellCheckCatalog as entry (entry.language)}
                <option value={entry.language}>{entry.label}</option>
              {/each}
            </select>
          </label>
          <p class="note">
            English and Norwegian (Bokmål) work immediately via a tiny bundled word list; every
            other language (and a fuller English/Norwegian dictionary) needs downloading below.
          </p>
          <ul class="dictionary-list">
            {#each settingsStore.spellCheckCatalog.filter((e) => e.language !== "Off") as entry (entry.language)}
              <li>
                <span>{entry.label}</span>
                {#if entry.downloaded}
                  <span class="downloaded">Downloaded</span>
                {:else}
                  <button
                    disabled={downloading === entry.language}
                    onclick={() => downloadDictionary(entry.language)}
                  >
                    {downloading === entry.language ? "Downloading…" : "Download"}
                  </button>
                {/if}
              </li>
            {/each}
          </ul>
        {:else if active === "Templates"}
          <label class="row">
            Date format for {"${{date}}"}
            <input
              type="text"
              placeholder="%Y-%m-%d"
              bind:value={settingsStore.value.template_date_format}
              onchange={update}
            />
          </label>
          <label class="row">
            Time format for {"${{time}}"}
            <input
              type="text"
              placeholder="%H:%M"
              bind:value={settingsStore.value.template_time_format}
              onchange={update}
            />
          </label>
        {:else if active === "Versions"}
          <label class="row">
            <input
              type="checkbox"
              checked={!settingsStore.value.git_integration_disabled}
              onchange={(e) => {
                settingsStore.value.git_integration_disabled = !(e.target as HTMLInputElement).checked;
                update();
              }}
            />
            Enable Git integration
          </label>
          <label class="column">
            Commit message template
            <textarea
              rows="4"
              placeholder={settingsStore.value.git_commit_message_template === null
                ? "Smaragd backup\n\n{{fileList}}"
                : ""}
              value={settingsStore.value.git_commit_message_template ?? ""}
              oninput={(e) => {
                const v = (e.target as HTMLTextAreaElement).value;
                settingsStore.value.git_commit_message_template = v === "" ? null : v;
                update();
              }}
            ></textarea>
            <span class="hint">
              Placeholders: {"{{date}}"}, {"{{time}}"}, {"{{numFiles}}"}, {"{{linesAdded}}"},
              {"{{linesChanged}}"}, {"{{linesDeleted}}"}, {"{{fileList}}"}. Used for a manual
              commit's pre-filled message and for every automatic commit. A blank line starts the
              commit body, same as git's own subject/body convention.
            </span>
          </label>
          <h4>Backups</h4>
          <label class="row">
            <input type="checkbox" bind:checked={settingsStore.value.backup_enabled} onchange={update} />
            Enable automatic backups
          </label>
          <label class="row">
            <input type="checkbox" bind:checked={settingsStore.value.backup_on_open} onchange={update} />
            Back up when opening a project
          </label>
          <label class="row">
            <input type="checkbox" bind:checked={settingsStore.value.backup_on_close} onchange={update} />
            Back up when closing a project
          </label>
          <label class="row">
            <input
              type="checkbox"
              bind:checked={settingsStore.value.backup_on_manual_save}
              onchange={update}
            />
            Back up on every manual save
          </label>
          <label class="row">
            Backups to keep
            <input
              type="number"
              min="1"
              max="100"
              placeholder="10"
              value={settingsStore.value.backup_keep_count || ""}
              oninput={(e) => {
                settingsStore.value.backup_keep_count = Number((e.target as HTMLInputElement).value);
                update();
              }}
            />
          </label>
          <label class="row">
            Backup folder
            <input
              type="text"
              readonly
              style="max-width: 20rem;"
              value={settingsStore.value.backup_dir ?? defaultBackupDir ?? "(no location available)"}
            />
          </label>
          <div class="row buttons">
            <button onclick={pickBackupDir}>Browse…</button>
            {#if settingsStore.value.backup_dir}
              <button onclick={resetBackupDir}>Reset</button>
            {/if}
          </div>
        {:else if active === "Sync"}
          <p class="note">
            Sync has no real device pairing in this build yet — the Sync dock panel runs a
            local demo against an in-memory vault instead (see Phase 6). Server/passphrase
            settings aren't modeled here until real pairing exists.
          </p>
        {:else if active === "Pomodoro"}
          <label class="row">
            Work session (min)
            <input
              type="number"
              min="1"
              max="180"
              placeholder="25"
              value={settingsStore.value.pomodoro_work_minutes || ""}
              oninput={(e) => {
                settingsStore.value.pomodoro_work_minutes = Number((e.target as HTMLInputElement).value);
                update();
              }}
            />
          </label>
          <label class="row">
            Short break (min)
            <input
              type="number"
              min="1"
              max="180"
              placeholder="5"
              value={settingsStore.value.pomodoro_short_break_minutes || ""}
              oninput={(e) => {
                settingsStore.value.pomodoro_short_break_minutes = Number(
                  (e.target as HTMLInputElement).value,
                );
                update();
              }}
            />
          </label>
          <label class="row">
            Long break (min)
            <input
              type="number"
              min="1"
              max="180"
              placeholder="15"
              value={settingsStore.value.pomodoro_long_break_minutes || ""}
              oninput={(e) => {
                settingsStore.value.pomodoro_long_break_minutes = Number(
                  (e.target as HTMLInputElement).value,
                );
                update();
              }}
            />
          </label>
          <label class="row">
            Cycles before long break
            <input
              type="number"
              min="1"
              max="20"
              placeholder="4"
              value={settingsStore.value.pomodoro_cycles_before_long_break || ""}
              oninput={(e) => {
                settingsStore.value.pomodoro_cycles_before_long_break = Number(
                  (e.target as HTMLInputElement).value,
                );
                update();
              }}
            />
          </label>
          <label class="row">
            <input
              type="checkbox"
              bind:checked={settingsStore.value.pomodoro_notifications_enabled}
              onchange={update}
            />
            Show a desktop notification when a phase completes
          </label>
        {:else if active === "Shortcuts"}
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Action</th>
                <th>Shortcut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each SHORTCUT_CATEGORIES as category (category)}
                {#each SHORTCUT_ACTIONS.filter((a) => a.category === category) as action (action.id)}
                  <tr>
                    <td class="muted">{category}</td>
                    <td>{action.label}</td>
                    <td>
                      {#if recordingFor === action.id}
                        <em>Press a new shortcut… (Esc to cancel)</em>
                      {:else}
                        {comboLabel(effectiveCombo(action))}
                      {/if}
                    </td>
                    <td class="actions">
                      <button onclick={() => startRecording(action.id)}>Change</button>
                      <button onclick={() => setShortcut(action.id, null)}>Clear</button>
                    </td>
                  </tr>
                {/each}
              {/each}
            </tbody>
          </table>
        {/if}
      </div>
    </div>
    <div class="footer">
      <button onclick={onClose}>OK</button>
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
    width: 720px;
    max-width: 95vw;
    height: 520px;
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
    width: 160px;
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
    gap: 0.6rem;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    font-size: 0.85rem;
  }

  .row input[type="text"],
  .row input[type="number"],
  .row select {
    max-width: 12rem;
  }

  .row.buttons {
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .column {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    font-size: 0.85rem;
  }

  .column textarea {
    font-family: inherit;
    font-size: 0.85rem;
    resize: vertical;
  }

  .hint {
    font-size: 0.75rem;
    color: var(--color-fg-muted);
  }

  h4 {
    margin: 0.5rem 0 0;
    font-size: 0.8rem;
    color: var(--color-fg-muted);
  }

  .note {
    font-size: 0.8rem;
    color: var(--color-fg-muted);
    font-style: italic;
  }

  .dictionary-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-width: 24rem;
  }

  .dictionary-list li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.25rem 0;
    border-bottom: 1px solid var(--color-border);
    font-size: 0.85rem;
  }

  .downloaded {
    color: var(--color-success);
    font-size: 0.8rem;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
  }

  th,
  td {
    text-align: left;
    padding: 0.2rem 0.4rem;
    border-bottom: 1px solid var(--color-border);
  }

  .muted {
    color: var(--color-fg-muted);
  }

  .actions {
    white-space: nowrap;
  }

  .actions button {
    font-size: 0.7rem;
    padding: 0.1rem 0.3rem;
  }

  .footer {
    border-top: 1px solid var(--color-border);
    padding: 0.5rem 1rem;
    display: flex;
    justify-content: flex-end;
  }
</style>
