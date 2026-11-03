<script lang="ts">
  import { onMount, onDestroy, mount, unmount } from "svelte";
  import {
    createDockview,
    themeLight,
    themeDark,
    type DockviewApi,
    type IContentRenderer,
    type IDockviewPanel,
    type Direction,
  } from "dockview-core";
  // Self-injects dockview's default (styled) CSS as a <style> tag on import —
  // this build ships styled/.noStyle pairs rather than a separate stylesheet
  // to import; see the Phase 5 commit message for how that was confirmed.
  import "dockview-core/dist/dockview-core.js";

  import StubPanel from "./panels/StubPanel.svelte";
  import { PANEL_TITLES, PANEL_COMPONENTS } from "./panelRegistry";
  import { registerDockLayout, unregisterDockLayout } from "./stores/dockLayoutRegistry.svelte";
  import { themeState } from "./stores/theme.svelte";
  import { settingsStore } from "./stores/settings.svelte";
  import { project, focusBinder, focusEditor } from "./stores/project.svelte";

  const STORAGE_KEY = "smaragd.dock-layout.v1";

  // Panel set/titles now live in panelRegistry.ts, shared with
  // MobileShell.svelte (Phase 9) — Settings and Daily Notes stay out of it
  // for the same reason noted there: neither is a DockTab in the real app.
  // StubPanel stays imported as the dockview fallback renderer for any
  // future tab added before its real content exists.
  const REAL_COMPONENTS = PANEL_COMPONENTS;

  let container: HTMLDivElement;
  let api: DockviewApi | undefined;
  let persistTimer: ReturnType<typeof setTimeout> | undefined;
  // Mirrors which panel ids are currently open, purely so the Window menu's
  // "open" highlight re-renders — dockview's own panel list isn't itself a
  // Svelte $state, so reading api.getPanel(id) directly in the template
  // wouldn't react to add/remove events.
  let openIds = $state<Set<string>>(new Set());

  function panelIds(): string[] {
    return Object.keys(PANEL_TITLES);
  }

  function svelteContentRenderer(id: string): IContentRenderer {
    const element = document.createElement("div");
    element.style.height = "100%";
    element.style.width = "100%";
    element.style.overflow = "auto";
    element.style.boxSizing = "border-box";
    let instance: object | undefined;
    const Component = REAL_COMPONENTS[id];
    return {
      element,
      init() {
        instance = Component
          ? mount(Component, { target: element })
          : mount(StubPanel, { target: element, props: { title: PANEL_TITLES[id] ?? id } });
      },
      dispose() {
        if (instance) unmount(instance);
      },
    };
  }

  function defaultLayout() {
    if (!api) return;
    // Mirrors `default_dock_state()` in app/src/app/dock.rs: a narrow Binder
    // column on the left, Editor filling the middle, Preview on the right —
    // everything else starts closed, reachable from the Window menu.
    api.addPanel({ id: "editor", component: "editor", title: PANEL_TITLES.editor });
    api.addPanel({
      id: "binder",
      component: "binder",
      title: PANEL_TITLES.binder,
      position: { referencePanel: "editor", direction: "left" },
    });
    api.addPanel({
      id: "preview",
      component: "preview",
      title: PANEL_TITLES.preview,
      position: { referencePanel: "editor", direction: "right" },
    });
  }

  export function resetLayout() {
    if (!api) return;
    api.clear();
    defaultLayout();
    persist();
  }

  // Where a panel was (relative to some other panel still in the layout)
  // the moment it was last closed via the toggle below — reapplied on
  // reopen so "toggle a panel off, then back on" restores it rather than
  // dumping it as a new tab in whatever group happens to be active, which
  // is dockview's own default placement for an addPanel() with no
  // `position`. Captured fresh every close, so it tracks wherever the user
  // last dragged the panel to, not just its original defaultLayout() spot.
  const rememberedPositions: Record<string, { referencePanel: string; direction: Direction; index?: number }> =
    {};

  function rememberPositionBeforeClose(panel: IDockviewPanel) {
    if (!api) return;
    const group = panel.group;
    const groupSiblings = group.panels.filter((p) => p.id !== panel.id);
    if (groupSiblings.length > 0) {
      // Tabbed together with at least one other panel — reopen as a tab in
      // the same group, at the same index among its tabs.
      const index = group.panels.findIndex((p) => p.id === panel.id);
      rememberedPositions[panel.id] = { referencePanel: groupSiblings[0].id, direction: "within", index };
      return;
    }
    // Alone in its own group (the common case for a column like Editor/
    // Binder/Preview) — find whichever other group's rendered bounding box
    // is the closest neighbor along an edge, and remember which side this
    // one was on, so addPanel's own `direction` (relative to that
    // neighbor) can place it right back there.
    const myRect = group.element.getBoundingClientRect();
    let best: { panelId: string; direction: Direction; gap: number } | undefined;
    for (const other of api.panels) {
      if (other.id === panel.id || other.group.id === group.id) continue;
      const rect = other.group.element.getBoundingClientRect();
      const verticalOverlap = Math.min(myRect.bottom, rect.bottom) - Math.max(myRect.top, rect.top);
      const horizontalOverlap = Math.min(myRect.right, rect.right) - Math.max(myRect.left, rect.left);
      let direction: Direction | undefined;
      let gap: number | undefined;
      if (verticalOverlap > Math.min(myRect.height, rect.height) * 0.5) {
        // Roughly the same row — side by side. `direction` is the side of
        // `other` to reopen on, i.e. the side *I* was on relative to it —
        // if `other`'s rect starts where mine ends, it's to my right, so I
        // was to *its* left, and vice versa.
        if (rect.left >= myRect.right - 1) {
          direction = "left";
          gap = rect.left - myRect.right;
        } else if (myRect.left >= rect.right - 1) {
          direction = "right";
          gap = myRect.left - rect.right;
        }
      } else if (horizontalOverlap > Math.min(myRect.width, rect.width) * 0.5) {
        // Roughly the same column — stacked, same reasoning.
        if (rect.top >= myRect.bottom - 1) {
          direction = "above";
          gap = rect.top - myRect.bottom;
        } else if (myRect.top >= rect.bottom - 1) {
          direction = "below";
          gap = myRect.top - rect.bottom;
        }
      }
      if (direction !== undefined && gap !== undefined && (!best || gap < best.gap)) {
        best = { panelId: other.id, direction, gap };
      }
    }
    if (best) {
      rememberedPositions[panel.id] = { referencePanel: best.panelId, direction: best.direction };
    } else {
      delete rememberedPositions[panel.id];
    }
  }

  function addPanelAtRememberedPosition(id: string) {
    if (!api) return;
    const remembered = rememberedPositions[id];
    if (remembered && api.getPanel(remembered.referencePanel)) {
      api.addPanel({
        id,
        component: id,
        title: PANEL_TITLES[id] ?? id,
        position: { referencePanel: remembered.referencePanel, direction: remembered.direction, index: remembered.index },
      });
      return;
    }
    api.addPanel({ id, component: id, title: PANEL_TITLES[id] ?? id });
  }

  // Brings `id` to front (or creates it), then — for the Binder and Editor
  // specifically — requests keyboard focus into it, matching the real
  // app's own tab-to-front-plus-focus-request combo
  // (ShortcutAction::ToggleBinderFocus/"Reveal in Binder",
  // binder_panel.rs's `focus_requested`). `setActive()` alone only changes
  // which tab is visually frontmost — it doesn't move the browser's actual
  // keyboard focus, so without this a panel brought to front by a shortcut
  // (e.g. F1 for the Editor) left focus sitting wherever it was before
  // (e.g. still in the Binder's tree) instead of landing somewhere useful.
  // Shared by openPanel's not-already-active branch and ensurePanelOpen,
  // the two places a panel actually transitions from not-visible to
  // visible.
  function showPanel(id: string) {
    if (!api) return;
    const existing = api.getPanel(id);
    if (existing) {
      existing.api.setActive();
    } else {
      addPanelAtRememberedPosition(id);
    }
    if (id === "binder") focusBinder();
    else if (id === "editor") focusEditor();
  }

  // A real toggle: clicking an already-*active* panel's button closes it;
  // clicking an open-but-inactive one (e.g. buried behind another tab in
  // the same group) just brings it to front, same as before — closing that
  // case too would be surprising (the user asked to see it, not hide a
  // panel they weren't even looking at). Every caller (the Window-menu
  // buttons below, View/Tools/Versions menu items, and every
  // DOCK_TAB_ACTIONS shortcut in shortcuts.ts — several literally named
  // "toggle_*") wants exactly this.
  export function openPanel(id: string) {
    if (!api) return;
    const existing = api.getPanel(id);
    if (existing?.api.isActive) {
      rememberPositionBeforeClose(existing);
      existing.api.close();
      return;
    }
    showPanel(id);
  }

  // Unlike openPanel, never closes an already-open-and-active panel — for
  // callers that want "make sure this is visible" (e.g. the `:tag` command
  // prompt command opening the Tags dock before filtering it), not a
  // toggle.
  export function ensurePanelOpen(id: string) {
    showPanel(id);
  }

  function persist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      if (!api) return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(api.toJSON()));
    }, 250);
  }

  // Window > Save Current Layout…/Layouts/Restore Default Layout — a named
  // map of full dockview snapshots in their own localStorage key, separate
  // from the single "current layout" STORAGE_KEY persists automatically.
  // Simpler than the real app's own saved_layouts.json (no dedicated Tauri
  // settings round trip for something this small and purely presentational).
  const SAVED_LAYOUTS_KEY = "smaragd.saved-layouts.v1";

  function readSavedLayouts(): Record<string, unknown> {
    try {
      return JSON.parse(localStorage.getItem(SAVED_LAYOUTS_KEY) ?? "{}");
    } catch {
      return {};
    }
  }

  export function listSavedLayouts(): string[] {
    return Object.keys(readSavedLayouts()).sort();
  }

  export function saveCurrentLayoutAs(name: string) {
    if (!api) return;
    const layouts = readSavedLayouts();
    layouts[name] = api.toJSON();
    localStorage.setItem(SAVED_LAYOUTS_KEY, JSON.stringify(layouts));
  }

  export function loadSavedLayout(name: string) {
    if (!api) return;
    const layouts = readSavedLayouts();
    const saved = layouts[name];
    if (!saved) return;
    api.fromJSON(saved as Parameters<DockviewApi["fromJSON"]>[0]);
    persist();
  }

  // Toggle Focus Mode — snapshot the current layout, clear down to just the
  // Editor, and restore the snapshot on exit. Same toJSON()/clear()/fromJSON()
  // calls `resetLayout`/`loadSavedLayout` already use, not a new dockview-core
  // capability. Doesn't maximize the OS window the way the real app's own
  // Focus Mode does (`ViewportCommand::Maximized`) — a platform-level nicety
  // orthogonal to the dock layout itself, left out of this pass.
  let preFocusLayout: unknown;

  export function enterFocusMode() {
    if (!api || preFocusLayout !== undefined) return;
    preFocusLayout = api.toJSON();
    api.clear();
    api.addPanel({ id: "editor", component: "editor", title: PANEL_TITLES.editor });
    // `api.clear()` destroys every panel's component instance, including
    // whichever one held keyboard focus (almost always the Editor, the
    // reason to enter Focus Mode at all) — the freshly (re)created one
    // above starts unfocused, same gap `showPanel` has its own fix for.
    focusEditor();
  }

  export function exitFocusMode() {
    if (!api || preFocusLayout === undefined) return;
    api.fromJSON(preFocusLayout as Parameters<DockviewApi["fromJSON"]>[0]);
    preFocusLayout = undefined;
    persist();
    // Same component-recreation gap as enterFocusMode, but only worth
    // re-focusing if Editor is actually what the restored layout brought
    // back to front — otherwise this would steal focus from whatever
    // panel the user had active before Focus Mode.
    if (api.getPanel("editor")?.api.isActive) focusEditor();
  }

  // Dockview renders its own chrome (tab bars, and critically each panel's
  // content-area background) via its own `--dv-*` CSS variables, which this
  // app's `--color-*` ones never touch — toggling dark mode without this
  // left every panel's content area a stark white, with only the text
  // inside it (which follows `--color-fg` directly) picking up the new
  // colors. `api.updateOptions` is dockview-core's documented way to swap
  // themes after construction, so this doesn't need to recreate the whole
  // dockview instance on every toggle.
  $effect(() => {
    // Read themeState.dark as its own statement, not inside the `api?.`
    // chain — `a?.b(c)` short-circuits the whole call, c included, when
    // `a` is nullish, so if this were one expression the effect's first
    // run (before onMount sets `api`) would never actually read
    // themeState.dark and Svelte would never register it as a dependency,
    // leaving every later toggle unable to re-trigger this effect at all.
    const theme = themeState.dark ? themeDark : themeLight;
    api?.updateOptions({ theme });
  });

  // The Editor/Preview tabs show which document they currently hold —
  // neither the real app's own dock_tab_viewer.rs does this (its tab
  // titles are static "Editor"/"Preview" labels too), but with several
  // panels open at once it's otherwise not obvious which is showing what
  // without clicking into each one. Reads openIds (not just
  // project.selectedPath) as its own statement, same reasoning as the
  // theme effect above — otherwise a panel added *after* the document
  // changed would never get its title updated, since the effect's first
  // run (before either panel exists) wouldn't have read openIds at all.
  $effect(() => {
    const editorOpen = openIds.has("editor");
    const previewOpen = openIds.has("preview");
    if (!api || (!editorOpen && !previewOpen)) return;
    const path = project.selectedPath;
    const name = path ? (path.split("/").pop() ?? path).replace(/\.md$/, "") : null;
    if (editorOpen) {
      api.getPanel("editor")?.api.setTitle(name ? `Editor — ${name}` : PANEL_TITLES.editor);
    }
    if (previewOpen) {
      api.getPanel("preview")?.api.setTitle(name ? `Preview — ${name}` : PANEL_TITLES.preview);
    }
  });

  onMount(() => {
    api = createDockview(container, {
      theme: themeState.dark ? themeDark : themeLight,
      createComponent: (options) => svelteContentRenderer(options.name),
    });
    api.onDidLayoutChange(() => persist());
    api.onDidAddPanel((panel) => {
      openIds.add(panel.id);
      openIds = new Set(openIds);
    });
    api.onDidRemovePanel((panel) => {
      openIds.delete(panel.id);
      openIds = new Set(openIds);
    });

    const saved = localStorage.getItem(STORAGE_KEY);
    let restored = false;
    if (saved) {
      try {
        api.fromJSON(JSON.parse(saved));
        // A successfully parsed layout can still be empty — e.g. persist()
        // firing on a layout-change event before any panel had been added
        // yet (confirmed: happened during this app's own automated dev-
        // launch smoke tests, which start the webview, trigger a layout
        // event, and get killed by a timeout well before defaultLayout()'s
        // panels would normally land — see this fix's commit message).
        // That's indistinguishable from a corrupt file unless checked for
        // explicitly: fromJSON doesn't throw on it, so without this check
        // `restored` stays true and the user is left with a real, valid,
        // completely empty dock forever after.
        restored = api.panels.length > 0;
      } catch {
        // Falls through to defaultLayout() below — a corrupt or
        // incompatible (e.g. pre-Phase-5) saved layout shouldn't leave the
        // user with no Editor tab at all.
      }
    }
    if (!restored) defaultLayout();
    registerDockLayout({
      openPanel,
      ensurePanelOpen,
      resetLayout,
      listSavedLayouts,
      saveCurrentLayoutAs,
      loadSavedLayout,
      enterFocusMode,
      exitFocusMode,
    });
  });

  onDestroy(() => {
    api?.clear();
    unregisterDockLayout();
  });
</script>

<div class="dock-shell">
  {#if !settingsStore.value.hide_window_button_bar}
    <div class="window-menu">
      <span>Window:</span>
      {#each panelIds() as id (id)}
        <button class:open={openIds.has(id)} onclick={() => openPanel(id)}>
          {PANEL_TITLES[id]}
        </button>
      {/each}
      <button class="reset" onclick={resetLayout}>Reset Layout</button>
    </div>
  {/if}
  <div class="dock-container" bind:this={container}></div>
</div>

<style>
  .dock-shell {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
  }

  .window-menu {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem;
    padding: 0.3rem 0.5rem;
    border-bottom: 1px solid var(--color-border);
    font-size: 0.8rem;
  }

  .window-menu button {
    font-size: 0.75rem;
    padding: 0.15rem 0.4rem;
  }

  .window-menu button.open {
    background: var(--color-accent);
    color: white;
  }

  .window-menu .reset {
    margin-left: auto;
  }

  .dock-container {
    flex: 1;
    min-height: 0;
  }
</style>
