<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { project, openDocument, gotoDocumentLine } from "./stores/project.svelte";
  import type { BinderNodeDto } from "./stores/project.svelte";
  import { SHORTCUT_ACTIONS, effectiveCombo, runShortcutAction } from "./shortcuts";
  import { requestSettings, requestProjectSettings } from "./stores/settingsRequest.svelte";

  // IntelliJ-style Search Everywhere, matching the real app's own
  // (app/src/ui/search_everywhere.rs): one modal over Documents (by name),
  // Text (inside documents), Actions, and Settings, plus an "All" tab
  // mixing a few top results from each. Text search is the one tab that
  // needs a round trip — `search_everywhere_text` (app-tauri/src/
  // project.rs) scans every document's on-disk content, debounced here
  // rather than on every keystroke.
  //
  // Also doubles as the real app's separate "Open Document" quick-switcher
  // (Cmd+P there) — opening straight to the All tab already covers that
  // case (type a name, hit Enter), so this port doesn't build a second,
  // narrower palette for it; `open_document` in shortcuts.ts just opens
  // this same component.
  let { onClose }: { onClose: () => void } = $props();

  const TABS = ["All", "Documents", "Text", "Actions", "Settings"] as const;
  type Tab = (typeof TABS)[number];

  const MIN_TEXT_QUERY_CHARS = 3;
  const ALL_SECTION_LIMIT = 5;
  const MAX_RESULTS = 30;
  const LINE_PREVIEW_CHARS = 90;

  /** A subsequence match (every query char appears in order, not
   * necessarily contiguous) scored by how compact and how early the match
   * is — standard "quick open" fuzzy ranking, replacing a plain substring
   * filter so e.g. "cm1" finds "Chapter Mystery 1". Returns `null` for no
   * match at all. */
  function fuzzyScore(target: string, query: string): number | null {
    if (!query) return 0;
    const t = target.toLowerCase();
    const q = query.toLowerCase();
    let from = 0;
    let first = -1;
    let last = -1;
    for (const ch of q) {
      const idx = t.indexOf(ch, from);
      if (idx === -1) return null;
      if (first === -1) first = idx;
      last = idx;
      from = idx + 1;
    }
    return (last - first - q.length + 1) * 1000 + first;
  }

  function truncate(text: string, max: number): string {
    return text.length > max ? `${text.slice(0, max)}…` : text;
  }

  let query = $state("");
  let tab = $state<Tab>("All");
  let selected = $state(0);

  function setTab(next: Tab) {
    tab = next;
    selected = 0;
  }

  function stepTab(forward: boolean) {
    const i = TABS.indexOf(tab);
    setTab(TABS[(i + (forward ? 1 : TABS.length - 1)) % TABS.length]);
  }

  // --- Documents --------------------------------------------------------
  function collectDocuments(node: BinderNodeDto, out: { name: string; path: string }[]) {
    if (node.kind === "Document") {
      out.push({ name: node.name, path: node.path });
    } else {
      for (const child of node.children) collectDocuments(child, out);
    }
  }

  const allDocuments = $derived.by(() => {
    const out: { name: string; path: string }[] = [];
    if (project.value) collectDocuments(project.value.tree, out);
    return out;
  });

  function relativeFolder(path: string): string {
    const root = project.value?.root ?? "";
    const rel = path.startsWith(root) ? path.slice(root.length + 1) : path;
    const idx = rel.lastIndexOf("/");
    return idx >= 0 ? rel.slice(0, idx) : "";
  }

  // --- Text ---------------------------------------------------------------
  type TextHit = { path: string; display: string; line: number; line_text: string };
  let textHits = $state<TextHit[]>([]);
  let textLoading = $state(false);
  let textDebounce: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    const q = query;
    const root = project.value?.root;
    const wantsText = tab === "All" || tab === "Text";
    clearTimeout(textDebounce);
    if (!wantsText || !root || q.trim().length < MIN_TEXT_QUERY_CHARS) {
      textHits = [];
      textLoading = false;
      return;
    }
    textLoading = true;
    textDebounce = setTimeout(async () => {
      try {
        textHits = await invoke<TextHit[]>("search_everywhere_text", { root, query: q });
      } catch {
        textHits = [];
      } finally {
        textLoading = false;
      }
    }, 150);
    return () => clearTimeout(textDebounce);
  });

  // --- Actions --------------------------------------------------------
  // Excludes the three `inlineConsumed` actions (they need a live editor
  // cursor — see shortcuts.ts's doc comment — which a click in this modal
  // doesn't have) and Search Everywhere itself, same exclusions the real
  // app's own `search_everywhere_actions` makes.
  const availableActions = SHORTCUT_ACTIONS.filter(
    (a) => !a.inlineConsumed && a.id !== "search_everywhere",
  );

  function shortcutLabel(actionId: string): string {
    const action = SHORTCUT_ACTIONS.find((a) => a.id === actionId);
    if (!action) return "";
    const combo = effectiveCombo(action);
    if (!combo || combo.key === "") return "";
    const mod = combo.ctrl_or_cmd ? "Ctrl+" : "";
    const alt = combo.alt ? "Alt+" : "";
    const shift = combo.shift ? "Shift+" : "";
    return `${mod}${alt}${shift}${combo.key.toUpperCase()}`;
  }

  // --- Settings -----------------------------------------------------------
  // Category-level only, no per-field keyword index (the real app's
  // SETTINGS_INDEX) — this port's settings dialogs don't have one built
  // yet, and a category is still a real, useful jump target on its own.
  const APP_SETTINGS_CATEGORIES = [
    "General",
    "Appearance",
    "Editor",
    "SpellCheck",
    "Templates",
    "Versions",
    "Sync",
    "Pomodoro",
    "Shortcuts",
  ];
  const PROJECT_SETTINGS_CATEGORIES = ["Binder", "DailyNotes", "FolderRoles", "Colors"];

  type SettingTarget = { label: string; context: string; open: () => void };

  const settingTargets = $derived.by((): SettingTarget[] => {
    const rows: SettingTarget[] = APP_SETTINGS_CATEGORIES.map((category) => ({
      label: category.replace(/([a-z])([A-Z])/g, "$1 $2"),
      context: "Settings",
      open: () => requestSettings(category),
    }));
    if (project.value) {
      for (const category of PROJECT_SETTINGS_CATEGORIES) {
        rows.push({
          label: category.replace(/([a-z])([A-Z])/g, "$1 $2"),
          context: "Project Settings",
          open: () => requestProjectSettings(category),
        });
      }
    }
    return rows;
  });

  // --- Rows ---------------------------------------------------------------
  type Row = { title: string; context: string; run: () => void };

  function rankedRows<T>(items: T[], text: (item: T) => string, limit: number, toRow: (item: T) => Row): Row[] {
    return items
      .map((item) => ({ item, score: fuzzyScore(text(item), query) }))
      .filter((r): r is { item: T; score: number } => r.score !== null)
      .sort((a, b) => a.score - b.score)
      .slice(0, limit)
      .map((r) => toRow(r.item));
  }

  function select(path: string) {
    openDocument(path);
    onClose();
  }

  function selectText(path: string, line: number) {
    gotoDocumentLine(path, line);
    onClose();
  }

  function runAction(id: string) {
    runShortcutAction(id);
    onClose();
  }

  function openSetting(open: () => void) {
    open();
    onClose();
  }

  function documentRows(limit: number): Row[] {
    return rankedRows(allDocuments, (d) => d.name, limit, (d) => ({
      title: d.name.replace(/\.md$/, ""),
      context: relativeFolder(d.path),
      run: () => select(d.path),
    }));
  }

  function actionRows(limit: number): Row[] {
    return rankedRows(availableActions, (a) => a.label, limit, (a) => ({
      title: a.label,
      context: shortcutLabel(a.id),
      run: () => runAction(a.id),
    }));
  }

  function settingRows(limit: number): Row[] {
    return rankedRows(settingTargets, (s) => s.label, limit, (s) => ({
      title: s.label,
      context: s.context,
      run: () => openSetting(s.open),
    }));
  }

  function textRows(limit: number): Row[] {
    return textHits.slice(0, limit).map((hit) => ({
      title: truncate(hit.line_text.trim(), LINE_PREVIEW_CHARS),
      context: `${hit.display}:${hit.line}`,
      run: () => selectText(hit.path, hit.line),
    }));
  }

  const results = $derived.by((): { section?: string; row: Row }[] => {
    if (tab === "All") {
      const sections: [string, Row[]][] = [
        ["Documents", documentRows(ALL_SECTION_LIMIT)],
        ["Actions", actionRows(ALL_SECTION_LIMIT)],
        ["Settings", settingRows(ALL_SECTION_LIMIT)],
        ["Text", textRows(ALL_SECTION_LIMIT)],
      ];
      return sections.flatMap(([section, rows]) => rows.map((row) => ({ section, row })));
    }
    const rows =
      tab === "Documents"
        ? documentRows(MAX_RESULTS)
        : tab === "Actions"
          ? actionRows(MAX_RESULTS)
          : tab === "Settings"
            ? settingRows(MAX_RESULTS)
            : textRows(MAX_RESULTS);
    return rows.map((row) => ({ row }));
  });

  function emptyMessage(): string {
    if (tab === "Text" || tab === "All") {
      if (project.value && textLoading) return "Searching…";
      if (query.trim().length < MIN_TEXT_QUERY_CHARS && tab === "Text") {
        return "Type at least 3 characters to search text.";
      }
    }
    return "No results.";
  }

  let inputEl = $state<HTMLInputElement>();

  // Not left to the <input>'s own `autofocus` attribute — unreliable in
  // this app's WebKitGTK webview for an element inserted after the page's
  // initial load (same class of focus quirk as MenuBar's tab buttons not
  // taking focus on click, found earlier).
  onMount(() => inputEl?.focus());

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      selected = Math.min(selected + 1, results.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selected = Math.max(selected - 1, 0);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      // Left/Right only, not Tab/Shift+Tab — Shift+Tab never reliably
      // reaches this handler in the WebKitGTK view this app ships in
      // (confirmed: tabindex="-1" on every button ruled out native focus
      // traversal as the cause, so the keydown itself isn't arriving as
      // `{ key: "Tab", shiftKey: true }`, or isn't arriving at all), so
      // Tab is left to its default browser behavior rather than half-
      // working. This is a single-line quick-filter field, not something
      // meant to be edited by repositioning the caret, so there's no
      // ordinary cursor-movement use of Left/Right being given up.
      e.preventDefault();
      stepTab(e.key === "ArrowRight");
    } else if (e.key === "Enter" && results[selected]) {
      results[selected].row.run();
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
    <div class="tabs">
      {#each TABS as t (t)}
        <!-- tabindex="-1": this WebKitGTK view's native Tab/Shift+Tab
             focus-traversal isn't reliably blocked by onKeydown's own
             preventDefault, so these buttons stay keyboard-reachable only
             through the onKeydown Tab/Left/Right handling below (which
             drives `tab` state directly) rather than through real DOM
             focus landing on them — otherwise native focus-traversal and
             `tab` state drift apart (the two visibly different
             indicators: a focus ring vs. the active-tab underline) and,
             once traversal runs off the first/last button, escapes the
             dialog entirely. -->
        <button
          class:active={tab === t}
          tabindex="-1"
          onclick={() => {
            setTab(t);
            inputEl?.focus();
          }}
        >
          {t}
        </button>
      {/each}
    </div>
    <input
      type="text"
      placeholder="Search documents, text, actions, and settings…"
      bind:value={query}
      bind:this={inputEl}
      oninput={() => (selected = 0)}
    />
    <ul>
      {#each results as { section, row }, i (i)}
        {#if section}
          {#if i === 0 || results[i - 1].section !== section}
            <li class="section">{section}</li>
          {/if}
        {/if}
        <li>
          <button class:selected={i === selected} tabindex="-1" onclick={row.run}>
            <span class="title">{row.title}</span>
            {#if row.context}
              <span class="context">{row.context}</span>
            {/if}
          </button>
        </li>
      {/each}
      {#if results.length === 0}
        <li class="empty">{emptyMessage()}</li>
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
    width: 36rem;
    max-width: 90vw;
    max-height: 65vh;
    background: var(--color-bg);
    border-radius: 6px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .tabs {
    display: flex;
    gap: 0.2rem;
    padding: 0.4rem 0.6rem 0;
  }

  .tabs button {
    background: none;
    border: none;
    padding: 0.3rem 0.6rem;
    font-size: 0.8rem;
    cursor: pointer;
    color: var(--color-fg-muted);
    border-bottom: 2px solid transparent;
  }

  .tabs button.active {
    color: var(--color-fg);
    border-bottom-color: var(--color-accent);
  }

  input {
    padding: 0.6rem 0.8rem;
    border: none;
    border-bottom: 1px solid var(--color-border);
    font-size: 0.95rem;
  }

  input:focus {
    outline: none;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0.25rem 0;
    overflow: auto;
  }

  .section {
    padding: 0.4rem 0.8rem 0.15rem;
    font-size: 0.7rem;
    font-weight: bold;
    color: var(--color-fg-muted);
  }

  button {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    width: 100%;
    background: none;
    border: none;
    text-align: left;
    padding: 0.4rem 0.8rem;
    cursor: pointer;
    font-size: 0.85rem;
  }

  button.selected {
    background: var(--color-selected-bg);
  }

  .title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .context {
    flex-shrink: 0;
    color: var(--color-fg-muted);
    font-size: 0.75rem;
  }

  .empty {
    padding: 0.5rem 0.8rem;
    color: var(--color-fg-muted);
    font-size: 0.85rem;
  }
</style>
