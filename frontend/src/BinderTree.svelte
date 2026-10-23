<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import {
    type BinderNodeDto,
    type FolderRole,
    project,
    openDocument,
    onTreeChange,
    recordRename,
    recordMove,
    cycleBinderColorMode,
    restorePath,
  } from "./stores/project.svelte";
  import { settingsStore } from "./stores/settings.svelte";
  import { showToast } from "./stores/toast.svelte";
  import { requestExport } from "./stores/exportRequest.svelte";

  const colorModeLabels: Record<string, string> = {
    Off: "Off",
    Status: "Status",
    Pov: "POV",
    WordCountProgress: "Word Count",
  };

  const FOLDER_ROLES: FolderRole[] = ["Research", "Trash", "Templates", "Manuscript", "World"];

  // Matches app/src/ui/binder_panel.rs's role_prefix exactly.
  const ROLE_ICONS: Record<FolderRole, string> = {
    Research: "🔍",
    Trash: "🗑",
    Templates: "📋",
    Manuscript: "📖",
    World: "🌐",
  };

  type PicklistField = "Type" | "Pov" | "Status";
  const PICKLIST_FIELDS: { field: PicklistField; label: string }[] = [
    { field: "Type", label: "Type" },
    { field: "Pov", label: "POV" },
    { field: "Status", label: "Status" },
  ];

  // Phase 4: the real Binder, replacing Phase 2's read-only recursive list —
  // create/rename/delete and drag-and-drop move/reorder, all round-tripping
  // through core's Project via the binder_* commands. Context actions are
  // plain hover-revealed buttons rather than a native context menu/dialog
  // system (not built yet), and new-item naming uses the browser's own
  // prompt() rather than an in-app modal — both deliberate simplifications
  // to keep this phase's scope to "the tree + DnD interaction, working
  // end-to-end", not the full binder_panel.rs feature set (templates, role
  // badges, picklist-source toggles, status colors, trash restore, ...).
  //
  // Phase 5: reads/writes the shared project store directly rather than
  // taking root/tree/selectedPath/onSelect/onTreeChange as props — this
  // component is now mounted standalone inside a dockview panel, with no
  // parent to pass them down from.
  const root = $derived(project.value!.root);
  const tree = $derived(project.value!.tree);

  let error = $state<string | null>(null);
  let dragOverPath = $state<string | null>(null);

  async function run<T>(promise: Promise<T>): Promise<T | undefined> {
    error = null;
    try {
      return await promise;
    } catch (err) {
      error = String(err);
      return undefined;
    }
  }

  async function newDocument(parent: string) {
    const name = window.prompt("New document name:", "Untitled");
    if (!name) return;
    const result = await run(
      invoke<{ tree: BinderNodeDto; path: string }>("binder_create_document", {
        root,
        parent,
        name,
      }),
    );
    if (result) {
      onTreeChange(result.tree);
      openDocument(result.path);
    }
  }

  async function newFolder(parent: string) {
    const name = window.prompt("New folder name:", "New Folder");
    if (!name) return;
    const newTree = await run(
      invoke<BinderNodeDto>("binder_create_folder", { root, parent, name }),
    );
    if (newTree) onTreeChange(newTree);
  }

  async function rename(path: string, currentName: string) {
    const newName = window.prompt("Rename to:", currentName);
    if (!newName || newName === currentName) return;
    const result = await run(
      invoke<{ tree: BinderNodeDto; path: string }>("binder_rename", { root, path, newName }),
    );
    if (result) {
      onTreeChange(result.tree);
      recordRename(path, result.path);
    }
  }

  async function remove(path: string, name: string) {
    if (!window.confirm(`Delete "${name}"?`)) return;
    const newTree = await run(invoke<BinderNodeDto>("binder_delete", { root, path }));
    if (newTree) onTreeChange(newTree);
  }

  // Phase 9: a non-drag way to move an item. HTML5 drag-and-drop (the
  // existing onDropOnFolder/onDropOnDocument handlers below) simply never
  // fires on touch — iOS Safari/WKWebView and Android Chrome don't
  // implement the HTML5 DnD spec for touch input at all, only mouse — so
  // without this, moving anything would be impossible on mobile, not just
  // inconvenient. A folder-path prompt rather than a visual picker, same
  // "ship the interaction, not the polish" tradeoff every other action
  // here already makes.
  async function moveTo(path: string, name: string) {
    const destination = window.prompt(`Move "${name}" to (absolute folder path):`, root);
    if (!destination) return;
    const result = await run(
      invoke<{ tree: BinderNodeDto; path: string }>("binder_move", { root, path, newParent: destination }),
    );
    if (result) {
      onTreeChange(result.tree);
      recordMove(path, result.path);
    }
  }

  function onDragStart(e: DragEvent, path: string) {
    e.dataTransfer?.setData("text/plain", path);
    e.dataTransfer!.effectAllowed = "move";
  }

  function onDragOver(e: DragEvent, path: string) {
    e.preventDefault();
    dragOverPath = path;
  }

  function onDragLeave(path: string) {
    if (dragOverPath === path) dragOverPath = null;
  }

  async function onDropOnFolder(e: DragEvent, folderPath: string) {
    e.preventDefault();
    dragOverPath = null;
    const dragged = e.dataTransfer?.getData("text/plain");
    if (!dragged || dragged === folderPath) return;
    const result = await run(
      invoke<{ tree: BinderNodeDto; path: string }>("binder_move", { root, path: dragged, newParent: folderPath }),
    );
    if (result) {
      onTreeChange(result.tree);
      recordMove(dragged, result.path);
    }
  }

  async function onDropOnDocument(e: DragEvent, beforePath: string) {
    e.preventDefault();
    dragOverPath = null;
    const dragged = e.dataTransfer?.getData("text/plain");
    if (!dragged || dragged === beforePath) return;
    const result = await run(
      invoke<{ tree: BinderNodeDto; path: string }>("binder_move_before", {
        root,
        path: dragged,
        before: beforePath,
      }),
    );
    if (result) {
      onTreeChange(result.tree);
      recordMove(dragged, result.path);
    }
  }

  // Right-click context menu — matches the real egui app's folder/document
  // menus (app/src/ui/binder_panel.rs) as closely as this port's own
  // simplifications allow: flyout submenus are plain CSS hover (no
  // keyboard-navigable flyout, unlike egui's), and new-item/rename naming
  // still uses the browser's own prompt() rather than an in-app modal. The
  // existing hover-revealed buttons above are kept as they are rather than
  // replaced by this — a touch device has no right-click/contextmenu event
  // (or CSS :hover) at all, so they're still the only way in on mobile.
  type ContextMenuState = { x: number; y: number; node: BinderNodeDto; isRoot: boolean };
  let contextMenu = $state<ContextMenuState | null>(null);
  let contextMenuRole = $state<FolderRole | null>(null);
  let contextMenuTrashed = $state(false);
  let contextMenuTemplates = $state<{ path: string; name: string }[]>([]);
  let contextMenuPicklist = $state<Record<PicklistField, boolean>>({
    Type: false,
    Pov: false,
    Status: false,
  });

  async function openContextMenu(e: MouseEvent, n: BinderNodeDto) {
    e.preventDefault();
    e.stopPropagation();
    const isRoot = n.path === root;
    contextMenu = { x: e.clientX, y: e.clientY, node: n, isRoot };
    contextMenuRole = null;
    contextMenuTrashed = false;
    contextMenuTemplates = [];
    contextMenuPicklist = { Type: false, Pov: false, Status: false };
    // "New From Template" and "Export…" apply to the project root too —
    // only Rename/Delete/Restore/Folder Role/Dropdown Source/Empty Trash
    // are excluded there, same as the real app's `is_root` check.
    if (n.kind === "Folder") {
      contextMenuTemplates = await invoke<{ path: string; name: string }[]>("template_documents", {
        root,
      });
    }
    if (isRoot) return;
    contextMenuTrashed = await invoke<boolean>("is_trashed", { root, path: n.path });
    if (n.kind === "Folder") {
      contextMenuRole = await invoke<FolderRole | null>("folder_role", { root, path: n.path });
      const [type, pov, status] = await Promise.all(
        PICKLIST_FIELDS.map(({ field }) =>
          invoke<boolean>("is_picklist_folder", { root, field, path: n.path }),
        ),
      );
      contextMenuPicklist = { Type: type, Pov: pov, Status: status };
    }
  }

  function closeContextMenu() {
    contextMenu = null;
  }

  async function createFromTemplate(parent: string, template: { path: string; name: string }) {
    const name = window.prompt("New document name:", template.name);
    if (!name) return;
    const result = await run(
      invoke<{ tree: BinderNodeDto; path: string; cursor: number | null }>(
        "binder_create_document_from_template",
        { root, parent, name, templatePath: template.path },
      ),
    );
    if (result) {
      onTreeChange(result.tree);
      openDocument(result.path);
    }
  }

  async function setRole(path: string, role: FolderRole | null) {
    try {
      await invoke("set_folder_role", { root, path, role });
    } catch (err) {
      showToast(String(err));
    } finally {
      closeContextMenu();
    }
  }

  async function togglePicklistFolder(path: string, field: PicklistField, checked: boolean) {
    try {
      await invoke("set_picklist_folder", { root, field, path: checked ? path : null });
    } catch (err) {
      showToast(String(err));
    } finally {
      closeContextMenu();
    }
  }

  async function doEmptyTrash() {
    try {
      const newTree = await invoke<BinderNodeDto>("empty_trash", { root });
      onTreeChange(newTree);
    } catch (err) {
      showToast(String(err));
    } finally {
      closeContextMenu();
    }
  }
</script>

{#snippet node(n: BinderNodeDto)}
  {#if n.kind === "Folder"}
    <details open>
      <summary
        class:drag-over={dragOverPath === n.path}
        draggable="true"
        ondragstart={(e) => onDragStart(e, n.path)}
        ondragover={(e) => onDragOver(e, n.path)}
        ondragleave={() => onDragLeave(n.path)}
        ondrop={(e) => onDropOnFolder(e, n.path)}
        oncontextmenu={(e) => openContextMenu(e, n)}
      >
        {#if n.color}
          <span class="color-dot" style="background: {n.color};"></span>
        {/if}
        {#if n.role}
          <span class="role-icon" title={n.role}>{ROLE_ICONS[n.role]}</span>
        {/if}
        <span class="name">{n.name}</span>
        <span class="actions">
          <button title="New document" onclick={() => newDocument(n.path)}>+file</button>
          <button title="New folder" onclick={() => newFolder(n.path)}>+folder</button>
          <button title="Rename" onclick={() => rename(n.path, n.name)}>rename</button>
          <button title="Move" onclick={() => moveTo(n.path, n.name)}>move</button>
          <button title="Delete" onclick={() => remove(n.path, n.name)}>del</button>
        </span>
      </summary>
      <ul>
        {#each n.children as child (child.path)}
          <li>{@render node(child)}</li>
        {/each}
      </ul>
    </details>
  {:else}
    <div
      class="doc-row"
      role="group"
      class:drag-over={dragOverPath === n.path}
      ondragover={(e) => onDragOver(e, n.path)}
      ondragleave={() => onDragLeave(n.path)}
      ondrop={(e) => onDropOnDocument(e, n.path)}
    >
      <button
        class="doc"
        class:selected={project.selectedPath === n.path}
        data-binder-path={n.path}
        draggable="true"
        ondragstart={(e) => onDragStart(e, n.path)}
        onclick={() => openDocument(n.path)}
        oncontextmenu={(e) => openContextMenu(e, n)}
      >
        {#if n.color}
          <span class="color-dot" style="background: {n.color};"></span>
        {/if}
        {n.name}
        {#if settingsStore.value.show_document_stats_in_binder && n.stats}
          <span class="stats">{n.stats.lines}/{n.stats.words}/{n.stats.chars}</span>
        {/if}
      </button>
      <span class="actions">
        <button title="Rename" onclick={() => rename(n.path, n.name)}>rename</button>
        <button title="Move" onclick={() => moveTo(n.path, n.name)}>move</button>
        <button title="Delete" onclick={() => remove(n.path, n.name)}>del</button>
      </span>
    </div>
  {/if}
{/snippet}

<div class="toolbar">
  <button title="Cycle binder color mode" onclick={cycleBinderColorMode}>
    Color: {colorModeLabels[project.value?.binder_color_mode ?? "Off"]}
  </button>
</div>
<nav class="tree">
  {@render node(tree)}
  {#if error}<p class="error">{error}</p>{/if}
</nav>

<svelte:window onkeydown={(e) => contextMenu && e.key === "Escape" && closeContextMenu()} />

{#if contextMenu}
  {@const menuNode = contextMenu.node}
  <div
    class="menu-backdrop"
    onclick={closeContextMenu}
    oncontextmenu={(e) => {
      e.preventDefault();
      closeContextMenu();
    }}
    role="presentation"
  ></div>
  <div class="context-menu" style="left: {contextMenu.x}px; top: {contextMenu.y}px;">
    {#if menuNode.kind === "Folder"}
      <button
        onclick={() => {
          newDocument(menuNode.path);
          closeContextMenu();
        }}
      >
        New File
      </button>
      <button
        onclick={() => {
          newFolder(menuNode.path);
          closeContextMenu();
        }}
      >
        New Folder
      </button>
      {#if contextMenuTemplates.length > 0}
        <div class="submenu-trigger">
          <span>New From Template</span>
          <span class="arrow">▸</span>
          <div class="submenu">
            {#each contextMenuTemplates as template (template.path)}
              <button
                onclick={() => {
                  createFromTemplate(menuNode.path, template);
                  closeContextMenu();
                }}
              >
                {template.name}
              </button>
            {/each}
          </div>
        </div>
      {/if}
      <div class="menu-separator"></div>
      <button
        onclick={() => {
          requestExport(menuNode.path);
          closeContextMenu();
        }}
      >
        Export…
      </button>
      {#if !contextMenu.isRoot}
        <div class="menu-separator"></div>
        <button
          onclick={() => {
            rename(menuNode.path, menuNode.name);
            closeContextMenu();
          }}
        >
          Rename
        </button>
        <button
          onclick={() => {
            remove(menuNode.path, menuNode.name);
            closeContextMenu();
          }}
        >
          Delete
        </button>
        {#if contextMenuTrashed}
          <button
            onclick={() => {
              restorePath(menuNode.path);
              closeContextMenu();
            }}
          >
            Restore
          </button>
        {/if}
        <div class="menu-separator"></div>
        <div class="submenu-trigger">
          <span>Folder Role</span>
          <span class="arrow">▸</span>
          <div class="submenu">
            {#each FOLDER_ROLES as role (role)}
              <button class="menu-radio" onclick={() => setRole(menuNode.path, role)}>
                <span class="radio-dot" class:checked={contextMenuRole === role}></span>
                {role}
              </button>
            {/each}
            <button class="menu-radio" onclick={() => setRole(menuNode.path, null)}>
              <span class="radio-dot" class:checked={contextMenuRole === null}></span>
              None
            </button>
          </div>
        </div>
        <div class="submenu-trigger">
          <span>Dropdown Source</span>
          <span class="arrow">▸</span>
          <div class="submenu">
            {#each PICKLIST_FIELDS as { field, label } (field)}
              <button
                class="menu-checkbox"
                onclick={() => togglePicklistFolder(menuNode.path, field, !contextMenuPicklist[field])}
              >
                <input type="checkbox" checked={contextMenuPicklist[field]} tabindex="-1" />
                {label}
              </button>
            {/each}
          </div>
        </div>
        {#if contextMenuRole === "Trash"}
          <div class="menu-separator"></div>
          <button onclick={doEmptyTrash}>Empty Trash</button>
        {/if}
      {/if}
    {:else}
      <button
        onclick={() => {
          rename(menuNode.path, menuNode.name);
          closeContextMenu();
        }}
      >
        Rename
      </button>
      <button
        onclick={() => {
          remove(menuNode.path, menuNode.name);
          closeContextMenu();
        }}
      >
        Delete
      </button>
      {#if contextMenuTrashed}
        <button
          onclick={() => {
            restorePath(menuNode.path);
            closeContextMenu();
          }}
        >
          Restore
        </button>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .toolbar {
    display: flex;
    justify-content: flex-end;
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
  }

  .toolbar button {
    background: none;
    border: 1px solid var(--color-border);
    border-radius: 3px;
    padding: 0.1rem 0.4rem;
    cursor: pointer;
    color: inherit;
  }

  .tree {
    border: 1px solid var(--color-border);
    padding: 0.5rem;
    overflow: auto;
  }

  /* Vertical guide line per nesting level, matching the real egui binder's
     own indent lines — a single continuous border on the child <ul> rather
     than one per <li>, so it doesn't break at every sibling gap. */
  .tree ul {
    list-style: none;
    margin: 0;
    padding-left: 0.85rem;
    border-left: 1px solid var(--color-border);
  }

  /* The native <details>/<summary> disclosure triangle varies by browser/
     platform (and some renderers hide it entirely) — replaced with an
     explicit ▶/▼ matching the real app's own triangle exactly, same glyph
     swapped on open rather than a CSS rotate, simplest thing that reads
     the same both states. */
  /* No justify-content: space-between here (unlike .doc-row) — the ▶/▼
     triangle below is itself a flex child (a ::before pseudo-element,
     not the UA's own separate marker box the way the old native
     <summary> marker was), so space-between would shove it to one edge
     and the name to the other instead of keeping them adjacent. .name's
     flex: 1 does the same "push .actions to the end" job instead. */
  summary {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    list-style: none;
  }

  summary .name {
    flex: 1;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  summary::before {
    content: "▶";
    display: inline-block;
    width: 1em;
    flex-shrink: 0;
    font-size: 0.7em;
    color: var(--color-fg-muted);
  }

  details[open] > summary::before {
    content: "▼";
  }

  /* Binder Color Mode (Off/Status/POV/Word Count) — a small swatch rather
     than a full-row background, so an arbitrary user-assigned hex color
     never has to also work as a text-contrast background in both themes. */
  .color-dot {
    display: inline-block;
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .role-icon {
    flex-shrink: 0;
    font-size: 0.85em;
    line-height: 1;
  }

  /* Toggle Document Stats in Binder — "lines/words/chars", same compact
     format the real app's document_stats_label uses. */
  .stats {
    margin-left: 0.4rem;
    font-size: 0.7rem;
    color: var(--color-fg-muted);
  }

  .doc-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .doc-row .doc {
    flex: 1;
    text-align: left;
    background: none;
    border: none;
    padding: 0.2rem 0.3rem;
    cursor: pointer;
  }

  .doc-row .doc.selected {
    background: var(--color-selected-bg);
  }

  .drag-over {
    outline: 2px dashed var(--color-accent);
  }

  .actions {
    display: none;
    gap: 0.25rem;
    white-space: nowrap;
  }

  /* Phase 9: hover-reveal only where hover actually exists. A touch
     device has no hover state at all, so these buttons were simply
     unreachable there before this — always-visible is the fix, not a
     tap-to-reveal step, since that would just move the same problem one
     level up (the first tap would need *something* to be visible). */
  @media (hover: hover) {
    summary:hover .actions,
    .doc-row:hover .actions {
      display: inline-flex;
    }
  }

  @media (hover: none) {
    .actions {
      display: inline-flex;
    }
  }

  .actions button {
    font-size: 0.7rem;
    padding: 0.1rem 0.3rem;
  }

  .error {
    color: var(--color-danger);
  }

  .menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
  }

  .context-menu {
    position: fixed;
    z-index: 1001;
    min-width: 11rem;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
    padding: 0.25rem 0;
    display: flex;
    flex-direction: column;
    font-size: 0.8rem;
  }

  .context-menu button {
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

  .context-menu button:hover {
    background: var(--color-selected-bg);
  }

  .menu-separator {
    height: 1px;
    background: var(--color-border);
    margin: 0.25rem 0;
  }

  .menu-radio {
    padding-left: 1.1rem;
  }

  .radio-dot {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 50%;
    border: 1px solid var(--color-fg-muted);
    flex-shrink: 0;
  }

  .radio-dot.checked {
    background: var(--color-accent);
    border-color: var(--color-accent);
  }

  .menu-checkbox input {
    pointer-events: none;
  }

  /* Flyout submenus (New From Template/Folder Role/Dropdown Source) — plain
     CSS :hover/:focus-within, same "flattened, not a true nested flyout"
     tradeoff this port already makes elsewhere (MenuBar.svelte's own
     Color Binder By), except here it's a real flyout since matching the
     egui app's look was the whole point. Mouse-only: a touch device has
     no :hover at all, same limitation the contextmenu event itself has. */
  .submenu-trigger {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.3rem 0.75rem;
    cursor: default;
  }

  .submenu-trigger:hover,
  .submenu-trigger:focus-within {
    background: var(--color-selected-bg);
  }

  .submenu-trigger .arrow {
    color: var(--color-fg-muted);
    font-size: 0.7rem;
  }

  .submenu {
    display: none;
    position: absolute;
    left: 100%;
    top: -0.25rem;
    min-width: 10rem;
    flex-direction: column;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
    padding: 0.25rem 0;
  }

  .submenu-trigger:hover > .submenu,
  .submenu-trigger:focus-within > .submenu {
    display: flex;
  }
</style>
