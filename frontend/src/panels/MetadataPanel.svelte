<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { project, applyDocumentMetaEdit } from "../stores/project.svelte";
  import { metadataSelection } from "../stores/metadataSelection.svelte";
  import { showToast } from "../stores/toast.svelte";

  // Matches the real app's metadata_panel.rs, including the two variants it
  // swaps in for `show` (a document's own frontmatter) depending on what's
  // selected in the Binder (stores/metadataSelection.svelte.ts, driven by
  // BinderTree.svelte's folder/root-row clicks — see that store's own doc
  // comment): `show_folder` (a folder's own small Type/Status/POV/Tags set,
  // no word count or inline tags — no single open buffer for either) and
  // `show_project` (the project-wide Title/Subtitle/Author/Point/Logline/
  // What if/Synopsis fields).
  //
  // Document/Folder share the same Type/Status/POV (free text, or a
  // dropdown when a picklist folder is assigned — Project::picklist_documents)
  // plus Tags (removable chips, comma/Enter-to-commit, autocomplete via
  // Project::all_tags) shape — the fieldRow/tagsEditor snippets below are
  // this port's equivalent of the real app's shared metadata_fields_grid/
  // tags_chip_editor, parameterized the same way. Status/POV each get a
  // color swatch (ProjectMeta::status_colors/pov_colors, reusing the
  // commands Project Settings already has). The document form additionally
  // shows a live word count, unremovable chips for #tags found in the body
  // text but not in frontmatter, and a read-only "Other fields" section for
  // YAML keys none of this has a field for.
  //
  // Writing back: document_metadata/frontmatter_write_back are pure text-
  // in/text-out (like render_markdown), operating on project.documentText
  // directly rather than disk (stores/project.svelte.ts's
  // applyDocumentMetaEdit) — the folder/project forms go through
  // set_folder_metadata/set_book_title/etc. instead, each a thin wrapper
  // around an existing core::project::Project setter. Free-text fields
  // commit on blur (the real app's egui form re-diffs every frame) —
  // simpler, and avoids a round trip on every character typed. Logline/
  // What if/Synopsis are plain fixed-row <textarea>s rather than the real
  // app's three-way-split-remaining-height layout (`show_project`'s own
  // `project_text_area` math) — not worth reproducing pixel for pixel here.
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

  type FolderMetaDto = {
    section_type: string | null;
    status: string | null;
    pov: string | null;
    word_count_target: number | null;
    tags: string[];
  };

  type ProjectMetaFieldsDto = {
    book_title: string | null;
    book_subtitle: string | null;
    book_author: string | null;
    point: string;
    logline: string;
    what_if: string;
    synopsis: string;
  };

  type PicklistOptions = { types: string[]; statuses: string[]; povs: string[] };

  const DEFAULT_SWATCH = "#888888";

  // --- Shared across Document/Folder: picklist options, colors, tags -----
  let picklists = $state<PicklistOptions>({ types: [], statuses: [], povs: [] });
  let statusColors = $state<Record<string, string>>({});
  let povColors = $state<Record<string, string>>({});
  let knownTags = $state<string[]>([]);

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

  function parsedWordCountTarget(text: string): number | null {
    const trimmed = text.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    return Number.isInteger(n) && n >= 0 ? n : null;
  }

  /** Splits any complete (comma-terminated) tags out of `input` — the typed-
   * comma-commits-everything-before-it behavior `tags_chip_editor` has, so
   * pasting "foo, bar, baz" produces three chips, not one long tag. */
  function splitCompleteTags(tags: string[], input: string): { tags: string[]; remainder: string } {
    if (!input.includes(",")) return { tags, remainder: input };
    const parts = input.split(",");
    const remainder = parts.pop() ?? "";
    let next = tags;
    for (const part of parts) next = appendTag(next, part);
    return { tags: next, remainder };
  }

  function appendTag(tags: string[], candidate: string): string[] {
    const trimmed = candidate.trim();
    if (!trimmed) return tags;
    if (tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) return tags;
    return [...tags, trimmed];
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

  function tagSuggestionsFor(tagInput: string): string[] {
    return tagInput.trim() ? filterCandidates(knownTags, tagInput.trim()).slice(0, 8) : [];
  }

  async function setStatusColor(status: string, hex: string) {
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

  async function setPovColor(pov: string, hex: string) {
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

  // --- Document form -------------------------------------------------------
  let docMeta = $state<DocumentMetaDto | null>(null);
  let docError = $state<string | null>(null);
  let docSectionType = $state("");
  let docStatus = $state("");
  let docPov = $state("");
  let docWordCountTargetText = $state("");
  let docTags = $state<string[]>([]);
  let docTagInput = $state("");
  let lastSyncedDocPath: string | null = null;

  // Re-parses on every project.documentText change (debounced) so the live
  // word count / inline-tags stay current while typing in the editor, but
  // only resets the editable draft fields when the *open document* itself
  // changed — otherwise this panel's own in-progress typing would get
  // overwritten by the round trip its own edit just triggered.
  let docMetaFetchTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    if (metadataSelection.value.kind !== "document") return;
    const path = project.selectedPath;
    const text = project.documentText;
    clearTimeout(docMetaFetchTimer);
    if (!path) {
      docMeta = null;
      return;
    }
    docMetaFetchTimer = setTimeout(async () => {
      try {
        const result = await invoke<DocumentMetaDto>("document_metadata", { contents: text });
        docMeta = result;
        if (path !== lastSyncedDocPath) {
          lastSyncedDocPath = path;
          docSectionType = result.section_type ?? "";
          docStatus = result.status ?? "";
          docPov = result.pov ?? "";
          docWordCountTargetText = result.word_count_target?.toString() ?? "";
          docTags = result.tags;
          docTagInput = "";
        }
      } catch (err) {
        docError = String(err);
      }
    }, 200);
  });

  async function commitDocumentMeta() {
    if (!project.value) return;
    try {
      const newContents = await invoke<string>("frontmatter_write_back", {
        contents: project.documentText,
        meta: {
          section_type: docSectionType.trim() || null,
          status: docStatus.trim() || null,
          pov: docPov.trim() || null,
          word_count_target: parsedWordCountTarget(docWordCountTargetText),
          tags: docTags,
        },
      });
      applyDocumentMetaEdit(newContents);
    } catch (err) {
      showToast(String(err));
    }
  }

  function docOnTagInputChange(value: string) {
    docTagInput = value;
    const { tags: next, remainder } = splitCompleteTags(docTags, docTagInput);
    docTagInput = remainder;
    if (next !== docTags) {
      docTags = next;
      commitDocumentMeta();
    }
  }

  function docAddTag(candidate: string) {
    const next = appendTag(docTags, candidate);
    docTagInput = "";
    if (next !== docTags) {
      docTags = next;
      commitDocumentMeta();
    }
  }

  function docRemoveTag(index: number) {
    docTags = docTags.filter((_, i) => i !== index);
    commitDocumentMeta();
  }

  const docInlineOnlyTags = $derived(
    (docMeta?.inline_tags ?? []).filter(
      (tag) => !docTags.some((existing) => existing.toLowerCase() === tag.toLowerCase()),
    ),
  );

  // --- Folder form -----------------------------------------------------
  let folderMeta = $state<FolderMetaDto | null>(null);
  let folderError = $state<string | null>(null);
  let folderSectionType = $state("");
  let folderStatus = $state("");
  let folderPov = $state("");
  let folderWordCountTargetText = $state("");
  let folderTags = $state<string[]>([]);
  let folderTagInput = $state("");
  let lastSyncedFolderPath: string | null = null;

  $effect(() => {
    const sel = metadataSelection.value;
    if (sel.kind !== "folder") return;
    const root = project.value?.root;
    if (!root) return;
    invoke<FolderMetaDto>("folder_metadata", { root, path: sel.path })
      .then((result) => {
        folderMeta = result;
        if (sel.kind === "folder" && sel.path !== lastSyncedFolderPath) {
          lastSyncedFolderPath = sel.path;
          folderSectionType = result.section_type ?? "";
          folderStatus = result.status ?? "";
          folderPov = result.pov ?? "";
          folderWordCountTargetText = result.word_count_target?.toString() ?? "";
          folderTags = result.tags;
          folderTagInput = "";
        }
      })
      .catch((err) => (folderError = String(err)));
  });

  async function commitFolderMeta() {
    const sel = metadataSelection.value;
    if (!project.value || sel.kind !== "folder") return;
    try {
      await invoke("set_folder_metadata", {
        root: project.value.root,
        path: sel.path,
        meta: {
          section_type: folderSectionType.trim() || null,
          status: folderStatus.trim() || null,
          pov: folderPov.trim() || null,
          word_count_target: parsedWordCountTarget(folderWordCountTargetText),
          tags: folderTags,
        },
      });
    } catch (err) {
      showToast(String(err));
    }
  }

  function folderOnTagInputChange(value: string) {
    folderTagInput = value;
    const { tags: next, remainder } = splitCompleteTags(folderTags, folderTagInput);
    folderTagInput = remainder;
    if (next !== folderTags) {
      folderTags = next;
      commitFolderMeta();
    }
  }

  function folderAddTag(candidate: string) {
    const next = appendTag(folderTags, candidate);
    folderTagInput = "";
    if (next !== folderTags) {
      folderTags = next;
      commitFolderMeta();
    }
  }

  function folderRemoveTag(index: number) {
    folderTags = folderTags.filter((_, i) => i !== index);
    commitFolderMeta();
  }

  // --- Project form ------------------------------------------------------
  let projectMeta = $state<ProjectMetaFieldsDto | null>(null);
  let projectError = $state<string | null>(null);
  let bookTitle = $state("");
  let bookSubtitle = $state("");
  let bookAuthor = $state("");
  let point = $state("");
  let logline = $state("");
  let whatIf = $state("");
  let synopsis = $state("");
  let lastSyncedProjectRoot: string | null = null;

  $effect(() => {
    if (metadataSelection.value.kind !== "project") return;
    const root = project.value?.root;
    if (!root) return;
    invoke<ProjectMetaFieldsDto>("project_meta_fields", { root })
      .then((result) => {
        projectMeta = result;
        if (root !== lastSyncedProjectRoot) {
          lastSyncedProjectRoot = root;
          bookTitle = result.book_title ?? "";
          bookSubtitle = result.book_subtitle ?? "";
          bookAuthor = result.book_author ?? "";
          point = result.point;
          logline = result.logline;
          whatIf = result.what_if;
          synopsis = result.synopsis;
        }
      })
      .catch((err) => (projectError = String(err)));
  });

  async function commitProjectField(command: string, paramName: string, value: string) {
    if (!project.value) return;
    try {
      await invoke(command, { root: project.value.root, [paramName]: value });
    } catch (err) {
      showToast(String(err));
    }
  }
</script>

{#snippet fieldRow(
  idPrefix: string,
  labelText: string,
  value: string,
  options: string[],
  onChange: (v: string) => void,
  colorValue: string | null,
  onColorChange: ((hex: string) => void) | null,
)}
  <label for={idPrefix}>{labelText}:</label>
  <div class="row-with-swatch">
    {#if options.length}
      <select id={idPrefix} value={value} onchange={(e) => onChange(e.currentTarget.value)}>
        <option value="">(none)</option>
        {#each options as option (option)}
          <option value={option}>{option}</option>
        {/each}
      </select>
    {:else}
      <input id={idPrefix} type="text" value={value} onchange={(e) => onChange(e.currentTarget.value)} />
    {/if}
    {#if onColorChange}
      <input
        type="color"
        value={colorValue ?? DEFAULT_SWATCH}
        disabled={!value.trim()}
        onchange={(e) => onColorChange(e.currentTarget.value)}
      />
    {/if}
  </div>
{/snippet}

{#snippet tagsEditor(
  tags: string[],
  tagInput: string,
  inlineOnly: string[],
  onInput: (v: string) => void,
  onAdd: (candidate: string) => void,
  onRemove: (index: number) => void,
)}
  <div class="tags-editor">
    {#if tags.length}
      <div class="chips">
        {#each tags as tag, i (tag)}
          <span class="chip">
            #{tag}
            <button type="button" class="chip-remove" onclick={() => onRemove(i)}>×</button>
          </span>
        {/each}
      </div>
    {/if}
    {#if inlineOnly.length}
      <div class="chips">
        {#each inlineOnly as tag (tag)}
          <span class="chip chip-inline" title="Found in the document text, not frontmatter">
            #{tag}
          </span>
        {/each}
      </div>
    {/if}
    <input
      type="text"
      placeholder="Add tag…"
      value={tagInput}
      oninput={(e) => onInput(e.currentTarget.value)}
      onkeydown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onAdd(tagInput);
        }
      }}
    />
    {#if tagInput.trim()}
      {@const suggestions = tagSuggestionsFor(tagInput)}
      {#if suggestions.length}
        <div class="chips">
          {#each suggestions as suggestion (suggestion)}
            <button type="button" class="suggestion" onclick={() => onAdd(suggestion)}>
              {suggestion}
            </button>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
{/snippet}

<div class="panel">
  {#if metadataSelection.value.kind === "project"}
    <h3>Project</h3>
    {#if projectError}
      <p class="error">{projectError}</p>
    {:else if projectMeta}
      <div class="project-form">
        <label for="meta-title">Title</label>
        <input
          id="meta-title"
          type="text"
          bind:value={bookTitle}
          onchange={() => commitProjectField("set_book_title", "title", bookTitle)}
        />
        <label for="meta-subtitle">Subtitle</label>
        <input
          id="meta-subtitle"
          type="text"
          bind:value={bookSubtitle}
          onchange={() => commitProjectField("set_book_subtitle", "subtitle", bookSubtitle)}
        />
        <label for="meta-author">Author</label>
        <input
          id="meta-author"
          type="text"
          bind:value={bookAuthor}
          onchange={() => commitProjectField("set_book_author", "author", bookAuthor)}
        />
        <label for="meta-point">Point</label>
        <input
          id="meta-point"
          type="text"
          bind:value={point}
          onchange={() => commitProjectField("set_project_point", "point", point)}
        />
        <label for="meta-logline">Logline</label>
        <textarea
          id="meta-logline"
          rows="3"
          bind:value={logline}
          onchange={() => commitProjectField("set_project_logline", "logline", logline)}
        ></textarea>
        <label for="meta-what-if">What if</label>
        <textarea
          id="meta-what-if"
          rows="3"
          bind:value={whatIf}
          onchange={() => commitProjectField("set_project_what_if", "what_if", whatIf)}
        ></textarea>
        <label for="meta-synopsis">Synopsis</label>
        <textarea
          id="meta-synopsis"
          rows="6"
          bind:value={synopsis}
          onchange={() => commitProjectField("set_project_synopsis", "synopsis", synopsis)}
        ></textarea>
      </div>
    {/if}
  {:else if metadataSelection.value.kind === "folder"}
    <h3>Folder Metadata</h3>
    {#if folderError}
      <p class="error">{folderError}</p>
    {:else if folderMeta}
      <div class="grid">
        {@render fieldRow(
          "meta-folder-type",
          "Type",
          folderSectionType,
          picklists.types,
          (v) => {
            folderSectionType = v;
            commitFolderMeta();
          },
          null,
          null,
        )}
        {@render fieldRow(
          "meta-folder-status",
          "Status",
          folderStatus,
          picklists.statuses,
          (v) => {
            folderStatus = v;
            commitFolderMeta();
          },
          statusColors[folderStatus.trim()],
          (hex) => setStatusColor(folderStatus, hex),
        )}
        {@render fieldRow(
          "meta-folder-pov",
          "POV",
          folderPov,
          picklists.povs,
          (v) => {
            folderPov = v;
            commitFolderMeta();
          },
          povColors[folderPov.trim()],
          (hex) => setPovColor(folderPov, hex),
        )}
        <label for="meta-folder-word-target">Word count target:</label>
        <input
          id="meta-folder-word-target"
          type="text"
          inputmode="numeric"
          bind:value={folderWordCountTargetText}
          onchange={commitFolderMeta}
        />
        <span class="label tags-label">Tags:</span>
        {@render tagsEditor(folderTags, folderTagInput, [], folderOnTagInputChange, folderAddTag, folderRemoveTag)}
      </div>
    {/if}
  {:else if !project.selectedPath}
    <p class="empty">Select a document in the Binder.</p>
  {:else if docError}
    <p class="error">{docError}</p>
  {:else if docMeta}
    <div class="grid">
      {@render fieldRow(
        "meta-type",
        "Type",
        docSectionType,
        picklists.types,
        (v) => {
          docSectionType = v;
          commitDocumentMeta();
        },
        null,
        null,
      )}
      {@render fieldRow(
        "meta-status",
        "Status",
        docStatus,
        picklists.statuses,
        (v) => {
          docStatus = v;
          commitDocumentMeta();
        },
        statusColors[docStatus.trim()],
        (hex) => setStatusColor(docStatus, hex),
      )}
      {@render fieldRow(
        "meta-pov",
        "POV",
        docPov,
        picklists.povs,
        (v) => {
          docPov = v;
          commitDocumentMeta();
        },
        povColors[docPov.trim()],
        (hex) => setPovColor(docPov, hex),
      )}

      <span class="label">Word count:</span>
      <span>{docMeta.word_count}</span>

      <label for="meta-word-target">Word count target:</label>
      <input
        id="meta-word-target"
        type="text"
        inputmode="numeric"
        bind:value={docWordCountTargetText}
        onchange={commitDocumentMeta}
      />

      <span class="label tags-label">Tags:</span>
      {@render tagsEditor(docTags, docTagInput, docInlineOnlyTags, docOnTagInputChange, docAddTag, docRemoveTag)}
    </div>

    {#if docMeta.extra_fields.length}
      <h4>Other fields</h4>
      <div class="grid">
        {#each docMeta.extra_fields as [key, value] (key)}
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

  h3 {
    margin: 0 0 0.5rem;
    font-size: 0.9rem;
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

  .project-form {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .project-form label {
    margin-top: 0.5rem;
    color: var(--color-fg-muted);
    font-size: 0.8rem;
  }

  .project-form input,
  .project-form textarea {
    width: 100%;
    box-sizing: border-box;
    font-family: inherit;
    font-size: inherit;
    resize: vertical;
  }

  .empty {
    color: var(--color-fg-muted);
  }

  .error {
    color: var(--color-danger);
  }
</style>
