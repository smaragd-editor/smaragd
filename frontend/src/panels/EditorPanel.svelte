<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import MarkdownEditor from "../MarkdownEditor.svelte";
  import { project, onEditorChange, registerEditor, openDocument } from "../stores/project.svelte";
  import { editorViewMode } from "../stores/editorViewMode.svelte";
  import { inlineBacklinks } from "../stores/inlineBacklinks.svelte";

  type BacklinkDto = { source_path: string; source_title: string; snippet: string };
  let backlinks = $state<BacklinkDto[]>([]);

  $effect(() => {
    if (inlineBacklinks.visible && project.value && project.selectedPath) {
      invoke<BacklinkDto[]>("backlinks_for", {
        root: project.value.root,
        path: project.selectedPath,
      })
        .then((result) => (backlinks = result))
        .catch(() => (backlinks = []));
    } else {
      backlinks = [];
    }
  });

  // Phase 5: Editor is now its own dockview panel, separate from Preview
  // (they were fused side-by-side in Phase 3's single document pane) —
  // matching the real app's DockTab enum, where Editor and Preview are
  // independently dockable tabs a user can split, stack, or float apart.
  let editor = $state<MarkdownEditor>();

  $effect(() => {
    registerEditor(editor);
    return () => registerEditor(undefined);
  });
</script>

{#if project.selectedPath}
  <div class="panel">
    <div class="main">
      {#if editorViewMode.mode === "reading"}
        <div class="reading">{@html project.previewHtml}</div>
      {:else}
        <MarkdownEditor bind:this={editor} value={project.documentText} onChange={onEditorChange} />
      {/if}
    </div>
    {#if inlineBacklinks.visible}
      <div class="inline-backlinks">
        <h4>Backlinks</h4>
        {#if backlinks.length === 0}
          <p class="empty">No backlinks.</p>
        {:else}
          <ul>
            {#each backlinks as b (b.source_path)}
              <li>
                <button onclick={() => openDocument(b.source_path)}>{b.source_title}</button>: {b.snippet}
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  </div>
{:else}
  <p class="empty">Select a document in the Binder.</p>
{/if}

<style>
  .panel {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .main {
    flex: 1;
    min-height: 0;
  }

  .empty {
    padding: 1rem;
    color: #888;
  }

  .reading {
    height: 100%;
    overflow: auto;
    padding: 0.5rem 0.75rem;
    box-sizing: border-box;
  }

  .inline-backlinks {
    flex: 0 0 auto;
    border-top: 1px solid #ccc;
    padding: 0.5rem 0.75rem;
    max-height: 30%;
    overflow: auto;
    box-sizing: border-box;
  }

  .inline-backlinks h4 {
    margin: 0 0 0.3rem;
    font-size: 0.8rem;
    color: #888;
  }

  .inline-backlinks ul {
    list-style: none;
    margin: 0;
    padding: 0;
    font-size: 0.85rem;
  }

  .inline-backlinks button {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-decoration: underline;
    font-weight: bold;
  }
</style>
