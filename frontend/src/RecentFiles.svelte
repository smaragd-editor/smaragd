<script lang="ts">
  import { project, openDocument, recentlyOpenedPaths } from "./stores/project.svelte";
  import type { BinderNodeDto } from "./stores/project.svelte";

  // Backs the Recent Files shortcut — a plain most-recently-opened-first
  // list (see stores/project.svelte.ts's history/recency comment for why
  // this is client-side only, not the real app's persisted Recently
  // Opened/Recently Edited switcher). Snapshotting `recentlyOpenedPaths()`
  // once on open rather than subscribing: the list only changes on
  // document open, which closes this palette anyway.
  let { onClose }: { onClose: () => void } = $props();

  function nameByPath(node: BinderNodeDto, out: Map<string, string>) {
    if (node.kind === "Document") {
      out.set(node.path, node.name);
    } else {
      for (const child of node.children) nameByPath(child, out);
    }
  }

  const names = $derived.by(() => {
    const out = new Map<string, string>();
    if (project.value) nameByPath(project.value.tree, out);
    return out;
  });

  const paths = recentlyOpenedPaths();
  let selected = $state(0);

  function displayName(path: string): string {
    return names.get(path) ?? path.split("/").pop()?.replace(/\.md$/, "") ?? path;
  }

  function select(path: string) {
    openDocument(path);
    onClose();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      selected = Math.min(selected + 1, paths.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selected = Math.max(selected - 1, 0);
    } else if (e.key === "Enter" && paths[selected]) {
      select(paths[selected]);
    }
  }
</script>

<div class="backdrop" onclick={onClose} role="presentation">
  <div
    class="palette"
    onclick={(e) => e.stopPropagation()}
    onkeydown={onKeydown}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <h3>Recent Files</h3>
    <ul>
      {#each paths as path, i (path)}
        <li>
          <button class:selected={i === selected} onclick={() => select(path)}>
            {displayName(path)}
          </button>
        </li>
      {/each}
      {#if paths.length === 0}
        <li class="empty">No recently opened documents yet</li>
      {/if}
    </ul>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.2);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 15vh;
    z-index: 1000;
  }

  .palette {
    width: 28rem;
    max-width: 90vw;
    max-height: 60vh;
    background: var(--color-bg);
    border-radius: 6px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  h3 {
    margin: 0;
    padding: 0.6rem 0.8rem;
    font-size: 0.85rem;
    border-bottom: 1px solid var(--color-border);
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0.25rem 0;
    overflow: auto;
  }

  button {
    display: block;
    width: 100%;
    background: none;
    border: none;
    text-align: left;
    padding: 0.4rem 0.8rem;
    cursor: pointer;
    font-size: 0.85rem;
    color: inherit;
  }

  button.selected {
    background: var(--color-selected-bg);
  }

  .empty {
    padding: 0.5rem 0.8rem;
    color: var(--color-fg-muted);
    font-size: 0.85rem;
  }
</style>
