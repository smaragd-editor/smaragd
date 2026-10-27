<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
  import MarkdownEditor from "../MarkdownEditor.svelte";
  import {
    project,
    onEditorChange,
    registerEditor,
    openDocument,
    renameSelection,
    moveSelectionTo,
    deleteSelection,
    openFindReplace,
  } from "../stores/project.svelte";
  import { editorViewMode, setEditorViewMode } from "../stores/editorViewMode.svelte";
  import { inlineBacklinks, toggleInlineBacklinks } from "../stores/inlineBacklinks.svelte";
  import { dockLayoutRegistry } from "../stores/dockLayoutRegistry.svelte";
  import { showToast } from "../stores/toast.svelte";

  // The real app's Editor pane has a ☰ menu in its top-right corner
  // (app/src/app/dock_tab_viewer.rs) — every item here reuses an existing
  // store function or Tauri plugin call rather than new backend wiring;
  // "Reveal file in navigation" is the one real simplification: this
  // port's Binder never collapses folders (BinderTree.svelte's <details>
  // is always `open`), so there's no ancestor-expanding to do — it just
  // opens the Binder panel and scrolls the row into view.
  let showMenu = $state(false);

  function closeMenu() {
    showMenu = false;
  }

  async function openInDefaultApp() {
    if (!project.selectedPath) return;
    try {
      await openPath(project.selectedPath);
    } catch (err) {
      showToast(String(err));
    }
    closeMenu();
  }

  async function showInFileManager() {
    if (!project.selectedPath) return;
    try {
      await revealItemInDir(project.selectedPath);
    } catch (err) {
      showToast(String(err));
    }
    closeMenu();
  }

  function revealInBinder() {
    if (!project.selectedPath) return;
    const path = project.selectedPath;
    dockLayoutRegistry.api?.openPanel("binder");
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-binder-path="${CSS.escape(path)}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    closeMenu();
  }

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
    <div class="toolbar">
      <button class="hamburger" onclick={() => (showMenu = !showMenu)}>☰</button>
      {#if showMenu}
        <div class="menu-backdrop" onclick={closeMenu} role="presentation"></div>
        <div class="menu">
          <button class="menu-radio" onclick={toggleInlineBacklinks}>
            <span class="check">{inlineBacklinks.visible ? "●" : ""}</span>
            Backlinks in document
          </button>
          <button
            class="menu-radio"
            onclick={() => {
              setEditorViewMode("source");
              closeMenu();
            }}
          >
            <span class="check">{editorViewMode.mode === "source" ? "●" : ""}</span>
            Source mode
          </button>
          <button
            class="menu-radio"
            onclick={() => {
              setEditorViewMode("reading");
              closeMenu();
            }}
          >
            <span class="check">{editorViewMode.mode === "reading" ? "●" : ""}</span>
            Reading view
          </button>
          <div class="menu-separator"></div>
          <button
            onclick={() => {
              renameSelection();
              closeMenu();
            }}
          >
            Rename…
          </button>
          <button
            onclick={() => {
              moveSelectionTo();
              closeMenu();
            }}
          >
            Move file to…
          </button>
          <div class="menu-separator"></div>
          <button
            onclick={() => {
              openFindReplace();
              closeMenu();
            }}
          >
            Find &amp; Replace…
          </button>
          <div class="menu-separator"></div>
          <button onclick={openInDefaultApp}>Open in default app</button>
          <button onclick={showInFileManager}>Show in system explorer</button>
          <button onclick={revealInBinder}>Reveal file in navigation</button>
          <div class="menu-separator"></div>
          <button
            onclick={() => {
              deleteSelection();
              closeMenu();
            }}
          >
            Delete file
          </button>
        </div>
      {/if}
    </div>
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

<svelte:window onkeydown={(e) => showMenu && e.key === "Escape" && closeMenu()} />

<style>
  .panel {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .toolbar {
    position: relative;
    display: flex;
    justify-content: flex-end;
    padding: 0.2rem 0.4rem;
    border-bottom: 1px solid var(--color-border);
  }

  .hamburger {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    padding: 0.15rem 0.5rem;
    color: inherit;
  }

  .hamburger:hover {
    background: var(--color-selected-bg);
  }

  .menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
  }

  .menu {
    position: absolute;
    top: 100%;
    right: 0.4rem;
    z-index: 1001;
    min-width: 13rem;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
    padding: 0.25rem 0;
    display: flex;
    flex-direction: column;
    font-size: 0.8rem;
  }

  .menu button {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: none;
    border: none;
    text-align: left;
    padding: 0.3rem 0.75rem;
    cursor: pointer;
    color: inherit;
    font-size: inherit;
  }

  .menu button:hover {
    background: var(--color-selected-bg);
  }

  .check {
    display: inline-block;
    width: 0.9rem;
    flex-shrink: 0;
  }

  .menu-separator {
    height: 1px;
    background: var(--color-border);
    margin: 0.25rem 0;
  }

  .main {
    flex: 1;
    min-height: 0;
  }

  .empty {
    padding: 1rem;
    color: var(--color-fg-muted);
  }

  .reading {
    height: 100%;
    overflow: auto;
    padding: 0.5rem 0.75rem;
    box-sizing: border-box;
  }

  .inline-backlinks {
    flex: 0 0 auto;
    border-top: 1px solid var(--color-border);
    padding: 0.5rem 0.75rem;
    max-height: 30%;
    overflow: auto;
    box-sizing: border-box;
  }

  .inline-backlinks h4 {
    margin: 0 0 0.3rem;
    font-size: 0.8rem;
    color: var(--color-fg-muted);
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
