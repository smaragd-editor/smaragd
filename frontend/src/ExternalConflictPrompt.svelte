<script lang="ts">
  import { externalConflict, resolveExternalConflict } from "./stores/project.svelte";

  const name = $derived(
    externalConflict.path?.split("/").pop()?.replace(/\.md$/, "") ?? "This document",
  );

  function keepMine() {
    resolveExternalConflict(false);
  }

  function reloadFromDisk() {
    resolveExternalConflict(true);
  }

  // Escape is treated as Keep Mine (external_conflict_prompt.rs's own
  // default) — the safer choice, since it never discards anything.
  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") keepMine();
  }
</script>

{#if externalConflict.path}
  <div class="backdrop" onclick={keepMine} onkeydown={onKeydown} role="presentation">
    <div
      class="modal"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => {
        e.stopPropagation();
        onKeydown(e);
      }}
      role="dialog"
      aria-modal="true"
      tabindex="-1"
    >
      <h2>Changed on Disk</h2>
      <p class="message">
        "{name}" was changed outside Smaragd, and you have unsaved edits here. Which version do
        you want to keep?
      </p>
      <div class="footer">
        <button onclick={keepMine}>Keep Mine</button>
        <button onclick={reloadFromDisk}>Reload from Disk</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
  }

  .modal {
    width: 22rem;
    max-width: calc(100vw - 2rem);
    background: var(--color-bg);
    border-radius: 6px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  h2 {
    margin: 0;
    font-size: 1.1rem;
  }

  .message {
    margin: 0;
    font-size: 0.9rem;
  }

  .footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
</style>
