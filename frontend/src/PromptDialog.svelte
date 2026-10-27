<script lang="ts">
  import { promptDialog } from "./stores/promptDialog.svelte";

  let input = $state<HTMLInputElement>();
  let value = $state("");

  $effect(() => {
    if (promptDialog.pending?.kind === "prompt") {
      value = promptDialog.pending.defaultValue;
      requestAnimationFrame(() => input?.select());
    }
  });

  function confirmPrompt() {
    if (promptDialog.pending?.kind !== "prompt") return;
    const resolve = promptDialog.pending.resolve;
    promptDialog.pending = null;
    resolve(value);
  }

  function confirmYes() {
    if (promptDialog.pending?.kind !== "confirm") return;
    const resolve = promptDialog.pending.resolve;
    promptDialog.pending = null;
    resolve(true);
  }

  function cancel() {
    if (!promptDialog.pending) return;
    const pending = promptDialog.pending;
    promptDialog.pending = null;
    if (pending.kind === "prompt") pending.resolve(null);
    else pending.resolve(false);
  }
</script>

{#if promptDialog.pending}
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
      <p class="message">{promptDialog.pending.message}</p>
      {#if promptDialog.pending.kind === "prompt"}
        <input
          type="text"
          bind:value
          bind:this={input}
          onkeydown={(e) => e.key === "Enter" && confirmPrompt()}
        />
      {/if}
      <div class="footer">
        <button onclick={cancel}>Cancel</button>
        {#if promptDialog.pending.kind === "prompt"}
          <button onclick={confirmPrompt}>OK</button>
        {:else}
          <button onclick={confirmYes}>OK</button>
        {/if}
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

  .message {
    margin: 0;
    font-size: 0.9rem;
    white-space: pre-wrap;
  }

  input {
    width: 100%;
    box-sizing: border-box;
  }

  .footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
</style>
