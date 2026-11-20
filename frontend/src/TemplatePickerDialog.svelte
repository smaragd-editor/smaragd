<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { templatePickerDialog } from "./stores/templatePickerDialog.svelte";

  type ProjectTemplate = { id: string; label: string; description: string };

  let templates = $state<ProjectTemplate[]>([]);
  let selected = $state("blank");
  let error = $state<string | null>(null);

  // Reloaded every time the dialog opens, not just on first mount, so a
  // template saved (or deleted) in a config-dir edit between two "New
  // Project" invocations is picked up without a restart.
  $effect(() => {
    if (!templatePickerDialog.pending) return;
    error = null;
    invoke<ProjectTemplate[]>("project_templates_list")
      .then((result) => {
        templates = result;
        selected = result[0]?.id ?? "blank";
      })
      .catch((err) => {
        error = String(err);
      });
  });

  function choose() {
    if (!templatePickerDialog.pending) return;
    const resolve = templatePickerDialog.pending.resolve;
    templatePickerDialog.pending = null;
    resolve(selected);
  }

  function cancel() {
    if (!templatePickerDialog.pending) return;
    const resolve = templatePickerDialog.pending.resolve;
    templatePickerDialog.pending = null;
    resolve(null);
  }
</script>

{#if templatePickerDialog.pending}
  <div
    class="backdrop"
    onclick={cancel}
    onkeydown={(e) => e.key === "Escape" && cancel()}
    role="presentation"
  >
    <div
      class="modal"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.key === "Escape" && cancel()}
      role="dialog"
      aria-modal="true"
      tabindex="-1"
    >
      <h2>New Project</h2>
      <p class="hint">Choose a template to start from:</p>

      {#if error}
        <p class="error">{error}</p>
      {:else}
        <div class="list">
          {#each templates as t (t.id)}
            <label class="option" class:selected={selected === t.id}>
              <input type="radio" name="template" value={t.id} bind:group={selected} />
              <span class="text">
                <span class="label">{t.label}</span>
                <span class="description">{t.description}</span>
              </span>
            </label>
          {/each}
        </div>
      {/if}

      <div class="footer">
        <button onclick={cancel}>Cancel</button>
        <button onclick={choose} disabled={!selected}>Choose…</button>
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
    width: 28rem;
    max-width: calc(100vw - 2rem);
    background: var(--color-bg);
    border-radius: 6px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  h2 {
    margin: 0;
    font-size: 1.1rem;
  }

  .hint {
    margin: 0;
    font-size: 0.85rem;
    color: var(--color-text-muted);
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    max-height: 18rem;
    overflow-y: auto;
  }

  .option {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    padding: 0.5rem;
    border-radius: 4px;
    cursor: pointer;
  }

  .option:hover {
    background: var(--color-bg-hover);
  }

  .option.selected {
    background: var(--color-bg-selected);
  }

  .option input {
    margin-top: 0.2rem;
  }

  .text {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .label {
    font-size: 0.9rem;
    font-weight: 600;
  }

  .description {
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }

  .error {
    color: var(--color-danger);
    font-size: 0.85rem;
  }

  .footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }
</style>
