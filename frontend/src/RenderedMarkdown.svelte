<script lang="ts">
  import {
    findDocumentByStem,
    openDocument,
    createDocumentAtSelection,
  } from "./stores/project.svelte";
  import { showToast } from "./stores/toast.svelte";

  // Shared by PreviewPanel.svelte and EditorPanel.svelte's reading view —
  // both just `{@html project.previewHtml}`'d this directly before, so a
  // `[[wikilink]]` rendered by core::markdown::render_html as
  // `<a data-wikilink="Target">` sat there inert: a real `<a>` is already
  // Tab-focusable and Enter-activates (native keyboard navigation, for
  // free), but nothing was listening for the resulting click. This adds
  // that one delegated handler plus the link/broken-link styling the
  // backend's "wikilink"/"wikilink broken" classes hook into — the
  // Preview-pane equivalent of the real app's own click handling in
  // ui/markdown_preview.rs: a plain click opens the resolved note or
  // reports "not found"; Ctrl/Cmd-click force-creates it when missing,
  // same modifier the real app's preview checks (`i.modifiers.command`).
  let { html }: { html: string } = $props();

  function onClick(e: MouseEvent) {
    const link = (e.target as HTMLElement).closest<HTMLElement>("[data-wikilink]");
    if (!link) return;
    e.preventDefault();
    const target = link.dataset.wikilink!;
    const path = findDocumentByStem(target);
    if (path) {
      openDocument(path);
    } else if (e.ctrlKey || e.metaKey) {
      createDocumentAtSelection(target);
    } else {
      showToast(`No note found for "${target}"`);
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events --
     event delegation only: every actual interactive element inside is a
     real `<a>`, which already has its own role/keyboard handling. -->
<div class="rendered-markdown" onclick={onClick}>
  {@html html}
</div>

<style>
  /* No box of its own — PreviewPanel.svelte's `.preview`/EditorPanel.svelte's
     `.reading` already own the padding/overflow/sizing this used to sit
     directly inside before this wrapper existed. */
  .rendered-markdown {
    display: contents;
  }

  .rendered-markdown :global(.wikilink) {
    color: var(--color-accent);
    text-decoration: none;
    cursor: pointer;
  }

  .rendered-markdown :global(.wikilink:hover) {
    text-decoration: underline;
  }

  .rendered-markdown :global(.wikilink.broken) {
    color: var(--color-broken-wikilink);
  }
</style>
