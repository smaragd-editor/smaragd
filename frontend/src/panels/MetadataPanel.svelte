<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { project, applyDocumentMetaEdit } from "../stores/project.svelte";
  import { showToast } from "../stores/toast.svelte";

  // Matches the real app's metadata_panel.rs for a document's own
  // frontmatter: Type/Status/POV (free text, or a dropdown when a picklist
  // folder is assigned — Project::picklist_documents), a live word-count
  // readout, a word-count target, and tags as removable chips with
  // autocomplete (Project::all_tags) plus unremovable chips for #tags found
  // in the body text but not in frontmatter. Status/POV each get a color
  // swatch (ProjectMeta::status_colors/pov_colors, already wired for
  // Project Settings — reused here). An "Other fields" section lists
  // whatever YAML keys frontmatter::extra_fields finds that this form has
  // no field for.
  //
  // Not ported: the real panel also renders in place of this one for a
  // selected *folder* (its own small Type/Status/POV/tags set — show_folder)
  // or the *project root* (Title/Subtitle/Author/Point/Logline/What
  // if/Synopsis — show_project) when the Binder's own folder/project row is
  // selected. This port's Binder has no such selection at all — only ever a
  // single open *document* (project.selectedPath) — so there's no trigger
  // for either variant to key off without first adding folder/project
  // selection to the Binder itself, a separate, larger change.
  //
  // Writing back: frontmatter_write_back/document_metadata are pure text-
  // in/text-out (like render_markdown), operating on project.documentText
  // directly rather than disk — see stores/project.svelte.ts's
  // applyDocumentMetaEdit for why. Free-text fields commit on blur/Enter
  // rather than per-keystroke (the real app's egui form re-diffs every
  // frame) — simpler, and avoids a round trip on every character typed.
  type DocumentMetaDto = {
    section_type: string | null;
    status: string | null;
    pov: string | null;
    word_count_target: number | null;
    tags: string[];
    word_count: number;
    inline_tags: string[];
    extra_fields: [string, string][];
  };

  type PicklistOptions = { types: string[]; statuses: string[]; povs: string[] };

  let meta = $state<DocumentMetaDto | null>(null);
  let error = $state<string | null>(null);
  let picklists = $state<PicklistOptions>({ types: [], statuses: [], povs: [] });
  let statusColors = $state<Record<string, string>>({});
  let povColors = $state<Record<string, string>>({});
  let knownTags = $state<string[]>([]);

  let sectionType = $state("");
  let status = $state("");
  let pov = $state("");
  let wordCountTargetText = $state("");
  let tags = $state<string[]>([]);
  let tagInput = $state("");

  let lastSyncedPath: string | null = null;

  // Re-parses on every project.documentText change (debounced) so the live
  // word count / inline-tags stay current while typing in the editor, but
  // only resets the editable draft fields when the *open document* itself
  // changed — otherwise this panel's own in-progress typing would get
  // overwritten by the round trip its own edit just triggered.
  let metaFetchTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const path = project.selectedPath;
    const text = project.documentText;
    clearTimeout(metaFetchTimer);
    if (!path) {
      meta = null;
      return;
    }
    metaFetchTimer = setTimeout(async () => {
      try {
        const result = await invoke<DocumentMetaDto>("document_metadata", { contents: text });
        meta = result;
        if (path !== lastSyncedPath) {
          lastSyncedPath = path;
          sectionType = result.section_type ?? "";
          status = result.status ?? "";
          pov = result.pov ?? "";
          wordCountTargetText = result.word_count_target?.toString() ?? "";
          tags = result.tags;
          tagInput = "";
        }
      } catch (err) {
        error = String(err);
      }
    }, 200);
  });

  $effect(() => {
    const root = project.value?.root;
    if (!root) return;
    invoke<PicklistOptions>("picklist_options", { root })
      .then((r) => (picklists = r))
      .catch(() => {});
    invoke<{ status_colors: Record<string, string>; pov_colors: Record<string, string> }>(
      "project_settings",
      { root },
    )
      .then((r) => {
        statusColors = r.status_colors;
        povColors = r.pov_colors;
      })
      .catch(() => {});
    invoke<string[]>("all_tags", { root })
      .then((r) => (knownTags = r))
      .catch(() => {});
  });

  function parsedWordCountTarget(): number | null {
    const trimmed = wordCountTargetText.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    return Number.isInteger(n) && n >= 0 ? n : null;
  }

  async function commitMeta() {
    if (!project.value) return;
    try {
      const newContents = await invoke<string>("frontmatter_write_back", {
        contents: project.documentText,
        meta: {
          section_type: sectionType.trim() || null,
          status: status.trim() || null,
          pov: pov.trim() || null,
          word_count_target: parsedWordCountTarget(),
          tags,
        },
      });
      applyDocumentMetaEdit(newContents);
    } catch (err) {
      showToast(String(err));
    }
  }

  function addTag(candidate: string) {
    const trimmed = candidate.trim();
    tagInput = "";
    if (!trimmed) return;
    if (tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) return;
    tags = [...tags, trimmed];
    commitMeta();
  }

  function removeTag(index: number) {
    tags = tags.filter((_, i) => i !== index);
    commitMeta();
  }

  function onTagInputChange() {
    if (!tagInput.includes(",")) return;
    const parts = tagInput.split(",");
    const remainder = parts.pop() ?? "";
    let changed = false;
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed && !tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
        tags = [...tags, trimmed];
        changed = true;
      }
    }
    tagInput = remainder;
    if (changed) commitMeta();
  }

  function onTagInputKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag(tagInput);
    }
  }

  // Mirrors the real app's autocomplete::filter_candidates: prefix matches
  // first (alphabetical), then substring matches (alphabetical).
  function filterCandidates(candidates: string[], query: string): string[] {
    const q = query.toLowerCase();
    const startsWith: string[] = [];
    const contains: string[] = [];
    for (const c of candidates) {
      const lower = c.toLowerCase();
      if (lower.startsWith(q)) startsWith.push(c);
      else if (lower.includes(q)) contains.push(c);
    }
    startsWith.sort();
    contains.sort();
    return [...startsWith, ...contains];
  }

  const tagSuggestions = $derived(
    tagInput.trim() ? filterCandidates(knownTags, tagInput.trim()).slice(0, 8) : [],
  );

  const inlineOnlyTags = $derived(
    (meta?.inline_tags ?? []).filter(
      (tag) => !tags.some((existing) => existing.toLowerCase() === tag.toLowerCase()),
    ),
  );

  async function setStatusColor(hex: string) {
    if (!project.value) return;
    const key = status.trim();
    if (!key) return;
    try {
      await invoke("set_status_color", { root: project.value.root, status: key, hex });
      statusColors = { ...statusColors, [key]: hex };
    } catch (err) {
      showToast(String(err));
    }
  }

  async function setPovColor(hex: string) {
    if (!project.value) return;
    const key = pov.trim();
    if (!key) return;
    try {
      await invoke("set_pov_color", { root: project.value.root, pov: key, hex });
      povColors = { ...povColors, [key]: hex };
    } catch (err) {
      showToast(String(err));
    }
  }

  const DEFAULT_SWATCH = "#888888";
</script>

<div class="panel">
  {#if !project.selectedPath}
    <p class="empty">Select a document in the Binder.</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else if meta}
    <div class="grid">
      <label for="meta-type">Type:</label>
      {#if picklists.types.length}
        <select id="meta-type" bind:value={sectionType} onchange={commitMeta}>
          <option value="">(none)</option>
          {#each picklists.types as option (option)}
            <option value={option}>{option}</option>
          {/each}
        </select>
      {:else}
        <input id="meta-type" type="text" bind:value={sectionType} onchange={commitMeta} />
      {/if}

      <label for="meta-status">Status:</label>
      <div class="row-with-swatch">
        {#if picklists.statuses.length}
          <select id="meta-status" bind:value={status} onchange={commitMeta}>
            <option value="">(none)</option>
            {#each picklists.statuses as option (option)}
              <option value={option}>{option}</option>
            {/each}
          </select>
        {:else}
          <input id="meta-status" type="text" bind:value={status} onchange={commitMeta} />
        {/if}
        <input
          type="color"
          value={statusColors[status.trim()] ?? DEFAULT_SWATCH}
          disabled={!status.trim()}
          onchange={(e) => setStatusColor(e.currentTarget.value)}
        />
      </div>

      <label for="meta-pov">POV:</label>
      <div class="row-with-swatch">
        {#if picklists.povs.length}
          <select id="meta-pov" bind:value={pov} onchange={commitMeta}>
            <option value="">(none)</option>
            {#each picklists.povs as option (option)}
              <option value={option}>{option}</option>
            {/each}
          </select>
        {:else}
          <input id="meta-pov" type="text" bind:value={pov} onchange={commitMeta} />
        {/if}
        <input
          type="color"
          value={povColors[pov.trim()] ?? DEFAULT_SWATCH}
          disabled={!pov.trim()}
          onchange={(e) => setPovColor(e.currentTarget.value)}
        />
      </div>

      <span class="label">Word count:</span>
      <span>{meta.word_count}</span>

      <label for="meta-word-target">Word count target:</label>
      <input
        id="meta-word-target"
        type="text"
        inputmode="numeric"
        bind:value={wordCountTargetText}
        onchange={commitMeta}
      />

      <span class="label tags-label">Tags:</span>
      <div class="tags-editor">
        {#if tags.length}
          <div class="chips">
            {#each tags as tag, i (tag)}
              <span class="chip">
                #{tag}
                <button type="button" class="chip-remove" onclick={() => removeTag(i)}>×</button>
              </span>
            {/each}
          </div>
        {/if}
        {#if inlineOnlyTags.length}
          <div class="chips">
            {#each inlineOnlyTags as tag (tag)}
              <span class="chip chip-inline" title="Found in the document text, not frontmatter">
                #{tag}
              </span>
            {/each}
          </div>
        {/if}
        <input
          type="text"
          placeholder="Add tag…"
          bind:value={tagInput}
          oninput={onTagInputChange}
          onkeydown={onTagInputKeydown}
        />
        {#if tagSuggestions.length}
          <div class="chips">
            {#each tagSuggestions as suggestion (suggestion)}
              <button type="button" class="suggestion" onclick={() => addTag(suggestion)}>
                {suggestion}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    {#if meta.extra_fields.length}
      <h4>Other fields</h4>
      <div class="grid">
        {#each meta.extra_fields as [key, value] (key)}
          <span class="label">{key}:</span>
          <span>{value}</span>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .panel {
    height: 100%;
    overflow: auto;
    padding: 0.5rem 0.75rem;
    box-sizing: border-box;
    font-size: 0.85rem;
  }

  .grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.5rem 0.75rem;
    align-items: start;
  }

  .grid label,
  .label {
    color: var(--color-fg-muted);
    padding-top: 0.25rem;
  }

  .tags-label {
    padding-top: 0.1rem;
  }

  select,
  input[type="text"] {
    width: 100%;
    box-sizing: border-box;
  }

  .row-with-swatch {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .row-with-swatch select,
  .row-with-swatch input[type="text"] {
    flex: 1;
  }

  input[type="color"] {
    flex-shrink: 0;
    width: 1.8rem;
    height: 1.6rem;
    padding: 0;
    border: 1px solid var(--color-border);
    background: none;
  }

  .tags-editor {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    background: var(--color-bg-alt);
    border: 1px solid var(--color-border);
    border-radius: 999px;
    padding: 0.1rem 0.5rem;
    font-size: 0.8rem;
  }

  .chip-inline {
    opacity: 0.7;
  }

  .chip-remove {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0 0.1rem;
    color: var(--color-fg-muted);
    font-size: 0.9rem;
    line-height: 1;
  }

  .chip-remove:hover {
    color: var(--color-danger);
  }

  .suggestion {
    background: var(--color-selected-bg);
    border: none;
    border-radius: 999px;
    padding: 0.1rem 0.5rem;
    font-size: 0.78rem;
    cursor: pointer;
  }

  h4 {
    margin: 1rem 0 0.4rem;
    font-size: 0.8rem;
    color: var(--color-fg-muted);
    font-weight: normal;
  }

  .empty {
    color: var(--color-fg-muted);
  }

  .error {
    color: var(--color-danger);
  }
</style>
