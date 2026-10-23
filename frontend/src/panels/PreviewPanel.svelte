<script lang="ts">
  import { project } from "../stores/project.svelte";
  import { previewZoom } from "../stores/previewZoom.svelte";
</script>

{#if project.selectedPath}
  <div
    class="preview"
    style="transform: scale({previewZoom.scale}); transform-origin: top left; width: {100 /
      previewZoom.scale}%;"
  >
    {@html project.previewHtml}
  </div>
{:else}
  <p class="empty">Select a document in the Binder.</p>
{/if}

<style>
  .preview {
    height: 100%;
    overflow: auto;
    padding: 0.5rem 0.75rem;
    box-sizing: border-box;
  }

  .empty {
    padding: 1rem;
    color: #888;
  }
</style>
