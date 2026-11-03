<script lang="ts">
  import { sanityCheckIssues, dismissSanityCheck } from "./stores/project.svelte";
</script>

{#if sanityCheckIssues.items.length > 0}
  <div
    class="backdrop"
    onclick={dismissSanityCheck}
    onkeydown={(e) => e.key === "Escape" && dismissSanityCheck()}
    role="presentation"
  >
    <div
      class="modal"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      tabindex="-1"
    >
      <h2>Project Sanity Check</h2>
      <p class="message">
        Found {sanityCheckIssues.items.length} issue{sanityCheckIssues.items.length === 1
          ? ""
          : "s"} comparing this project's saved metadata against what's actually on disk — most
        likely from something changing the vault outside Smaragd (a manual edit, a git pull, a
        sync merge):
      </p>
      <ul class="issues">
        {#each sanityCheckIssues.items as issue (issue)}
          <li>{issue}</li>
        {/each}
      </ul>
      <div class="footer">
        <button onclick={dismissSanityCheck}>OK</button>
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

  .message {
    margin: 0;
    font-size: 0.85rem;
  }

  .issues {
    margin: 0;
    padding-left: 1.25rem;
    font-size: 0.85rem;
    max-height: 15rem;
    overflow-y: auto;
  }

  .footer {
    display: flex;
    justify-content: flex-end;
    margin-top: 0.25rem;
  }
</style>
