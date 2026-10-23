<script lang="ts">
  import { onMount } from "svelte";
  import ProjectView from "./ProjectView.svelte";
  import MenuBar from "./MenuBar.svelte";
  import { viewport } from "./stores/viewport.svelte";
  import { loadSettings } from "./stores/settings.svelte";
  import { toast } from "./stores/toast.svelte";
  import { applyTheme } from "./stores/theme.svelte";
  import { handleGlobalKeydown, installBuiltinShortcutHandlers } from "./shortcuts";

  // Menu bar + global keyboard shortcuts are desktop-only — mobile already
  // has its own navigation (MobileShell.svelte, Phase 9) and no keyboard to
  // bind against most of these to.
  onMount(() => {
    loadSettings().then(applyTheme);
    installBuiltinShortcutHandlers();
    window.addEventListener("keydown", handleGlobalKeydown);
    return () => window.removeEventListener("keydown", handleGlobalKeydown);
  });
</script>

<main>
  {#if !viewport.isMobile}
    <MenuBar />
  {/if}
  <div class="body">
    <ProjectView />
  </div>
  {#if toast.message}
    <div class="toast">{toast.message}</div>
  {/if}
</main>

<style>
  /* Dark mode infrastructure (stores/theme.svelte.ts applies these):
     --color-bg/fg/accent/broken-wikilink are a selected ColorTheme's own 4
     portable colors (core::color_theme's doc comment calls for exactly this
     — CSS custom properties, not egui::Visuals), overridden inline on
     :root when a named theme is active. Everything else (border/muted/
     selected/success/warning/danger) is a static light/dark pair chosen by
     [data-theme] (explicit "dark"/"light", or a named theme's own `dark`
     flag) or, with no theme and theme_preference "system", by the OS's own
     prefers-color-scheme. */
  :global(:root) {
    color-scheme: light;
    --color-bg: #ffffff;
    --color-bg-alt: #f3f3f3;
    --color-fg: #1a1a1a;
    --color-fg-muted: #888888;
    --color-border: #cccccc;
    --color-selected-bg: #eeeeff;
    --color-accent: #4a5a99;
    --color-success: #2e7d32;
    --color-warning: #b8860b;
    --color-danger: #c0392b;
    --color-broken-wikilink: #c0392b;
  }

  :global(:root[data-theme="dark"]) {
    color-scheme: dark;
    --color-bg: #1e1e1e;
    --color-bg-alt: #2a2a2a;
    --color-fg: #e0e0e0;
    --color-fg-muted: #999999;
    --color-border: #4a4a4a;
    --color-selected-bg: #2d3f5c;
    --color-accent: #7a92e0;
    --color-success: #5cb85c;
    --color-warning: #e0b84a;
    --color-danger: #e06c75;
    --color-broken-wikilink: #e06c75;
  }

  @media (prefers-color-scheme: dark) {
    :global(:root:not([data-theme])) {
      color-scheme: dark;
      --color-bg: #1e1e1e;
      --color-bg-alt: #2a2a2a;
      --color-fg: #e0e0e0;
      --color-fg-muted: #999999;
      --color-border: #4a4a4a;
      --color-selected-bg: #2d3f5c;
      --color-accent: #7a92e0;
      --color-success: #5cb85c;
      --color-warning: #e0b84a;
      --color-danger: #e06c75;
      --color-broken-wikilink: #e06c75;
    }
  }

  :global(html, body) {
    /* Dynamic viewport height — shrinks with the on-screen keyboard on
       mobile WebViews instead of leaving stale space behind it the way
       100vh does. Behaves identically to 100vh on desktop/no-keyboard. */
    height: 100dvh;
    margin: 0;
    background: var(--color-bg);
    color: var(--color-fg);
  }

  :global(#app) {
    height: 100%;
  }

  main {
    font-family: system-ui, sans-serif;
    display: flex;
    flex-direction: column;
    height: 100%;
    box-sizing: border-box;
    position: relative;
  }

  /* No padding/centering here — the dock layout should fill the whole
     window (a centered, width-capped column was the "gigantic bezel"
     reported on a wide desktop window). ProjectView's own "open a project"
     screen applies its own narrower, padded wrapper around just that form;
     everything else (DockLayout, MobileShell) goes edge-to-edge. */
  .body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .toast {
    position: fixed;
    bottom: 1rem;
    left: 50%;
    transform: translateX(-50%);
    background: #333;
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    font-size: 0.85rem;
    z-index: 2000;
  }
</style>
