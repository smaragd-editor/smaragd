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

  type FuzzyMatch = { index: number; score: number };

  /** Fuzzy-ranks `candidates` against `query` via core::fuzzy::fuzzy_rank
   * (nucleo-matcher, the Helix picker's own engine) — real fzf-style
   * subsequence scoring with path-aware bonuses, rather than reimplementing
   * that matching in TS. `paths` matches fuzzy_rank's own: true for
   * document names (`/`-separated), false for plain action/setting
   * labels. */
  async function fuzzyRank(
    candidates: string[],
    query: string,
    limit: number,
    paths: boolean,
  ): Promise<FuzzyMatch[]> {
    if (candidates.length === 0) return [];
    return invoke<FuzzyMatch[]>("fuzzy_rank_strings", { candidates, query, limit, paths });
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

  // Re-ranked (via fuzzyRank, above) whenever the query, the active tab (it
  // changes the limit — ALL_SECTION_LIMIT per section on the All tab,
  // MAX_RESULTS on a single-tab view, same as the old rankedRows calls
  // took), or a candidate list itself changes. Debounced lightly so fast
  // typing coalesces into one Tauri round trip per pause rather than one
  // per keystroke.
  let documentRanks = $state<FuzzyMatch[]>([]);
  let actionRanks = $state<FuzzyMatch[]>([]);
  let settingRanks = $state<FuzzyMatch[]>([]);
  let rankDebounce: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    const q = query;
    const docs = allDocuments.map((d) => d.name);
    const actions = availableActions.map((a) => a.label);
    const settings = settingTargets.map((s) => s.label);
    const limit = tab === "All" ? ALL_SECTION_LIMIT : MAX_RESULTS;
    clearTimeout(rankDebounce);
    rankDebounce = setTimeout(async () => {
      const [d, a, s] = await Promise.all([
        fuzzyRank(docs, q, limit, true),
        fuzzyRank(actions, q, limit, false),
        fuzzyRank(settings, q, limit, false),
      ]);
      documentRanks = d;
      actionRanks = a;
      settingRanks = s;
    }, 50);
    return () => clearTimeout(rankDebounce);
  });

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

  function documentRows(ranks: FuzzyMatch[]): Row[] {
    return ranks.map(({ index }) => {
      const d = allDocuments[index];
      return {
        title: d.name.replace(/\.md$/, ""),
        context: relativeFolder(d.path),
        run: () => select(d.path),
      };
    });
  }

  function actionRows(ranks: FuzzyMatch[]): Row[] {
    return ranks.map(({ index }) => {
      const a = availableActions[index];
      return { title: a.label, context: shortcutLabel(a.id), run: () => runAction(a.id) };
    });
  }

  function settingRows(ranks: FuzzyMatch[]): Row[] {
    return ranks.map(({ index }) => {
      const s = settingTargets[index];
      return { title: s.label, context: s.context, run: () => openSetting(s.open) };
    });
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
        ["Documents", documentRows(documentRanks)],
        ["Actions", actionRows(actionRanks)],
        ["Settings", settingRows(settingRanks)],
        ["Text", textRows(ALL_SECTION_LIMIT)],
      ];
      return sections.flatMap(([section, rows]) => rows.map((row) => ({ section, row })));
    }
    const rows =
      tab === "Documents"
        ? documentRows(documentRanks)
        : tab === "Actions"
          ? actionRows(actionRanks)
          : tab === "Settings"
            ? settingRows(settingRanks)
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
