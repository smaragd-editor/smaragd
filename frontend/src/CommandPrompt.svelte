<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import {
    project,
    openDocument,
    manualSaveDocument,
    createDocumentAtSelection,
    openFindReplace,
    openDailyNote,
    runPluginCommand,
    findDocumentByStem,
  } from "./stores/project.svelte";
  import type { BinderNodeDto } from "./stores/project.svelte";
  import { runShortcutAction } from "./shortcuts";
  import { settingsStore, saveSettingsDebounced } from "./stores/settings.svelte";
  import { applyTheme } from "./stores/theme.svelte";
  import { showToast } from "./stores/toast.svelte";
  import { dockLayoutRegistry } from "./stores/dockLayoutRegistry.svelte";
  import { requestTagFilter } from "./stores/tagsRequest.svelte";
  import {
    parseCommand,
    completions,
    applyCompletion,
    type Command,
    type GitCommand,
  } from "./commandPrompt";

  // A real vim/Helix-style `:` command line, matching the real app's own
  // command_prompt.rs — this was a fuzzy filter over SHORTCUT_ACTIONS
  // instead for a while (a simplified substitute, by this component's own
  // earlier doc comment); Search Everywhere's Actions tab already covers
  // that need now, so this went back to matching the real thing instead of
  // duplicating it.
  let { onClose }: { onClose: () => void } = $props();

  let input = $state("");
  let selected = $state(0);
  let error = $state<string | null>(null);

  function collectDocuments(node: BinderNodeDto, out: { stem: string; path: string }[]) {
    if (node.kind === "Document") {
      out.push({ stem: node.name.replace(/\.md$/, ""), path: node.path });
    } else {
      for (const child of node.children) collectDocuments(child, out);
    }
  }

  const documents = $derived.by(() => {
    const out: { stem: string; path: string }[] = [];
    if (project.value) collectDocuments(project.value.tree, out);
    return out;
  });

  const noteTitles = $derived(documents.map((d) => d.stem));
  const themeIds = $derived(settingsStore.colorThemes.map((t) => t.id));
  const gitEnabled = $derived(!settingsStore.value.git_integration_disabled);

  let tagNames = $state<string[]>([]);
  $effect(() => {
    const root = project.value?.root;
    if (!root) return;
    invoke<string[]>("all_tags", { root })
      .then((r) => (tagNames = r))
      .catch(() => {});
  });

  let pluginCommands = $state<string[]>([]);
  $effect(() => {
    const root = project.value?.root;
    if (!root) return;
    invoke<string[]>("plugins_list_commands", { root })
      .then((r) => (pluginCommands = r))
      .catch(() => {});
  });

  const suggestions = $derived(
    completions(input, noteTitles, themeIds, tagNames, gitEnabled, pluginCommands),
  );

  async function executeGit(cmd: GitCommand) {
    if (!project.value) return;
    const root = project.value.root;
    if (!gitEnabled) {
      showToast("Git integration is disabled — enable it in Settings > Versions");
      return;
    }
    try {
      switch (cmd.kind) {
        case "enable":
          await invoke("git_enable", { root });
          showToast("Git support enabled");
          break;
        case "commit":
          if (cmd.message) {
            await invoke("git_commit", { root, message: cmd.message });
            showToast("Committed");
          } else {
            runShortcutAction("git_commit");
          }
          break;
        case "push":
          runShortcutAction("git_push");
          break;
        case "pull":
          runShortcutAction("git_pull");
          break;
        case "backup":
          if (cmd.message) {
            await invoke("git_commit", { root, message: cmd.message });
            await invoke("git_push", { root });
            showToast("Committed and pushed");
          } else {
            runShortcutAction("git_commit_and_push");
          }
          break;
      }
    } catch (err) {
      showToast(String(err));
    }
  }

  async function execute(command: Command) {
    switch (command.kind) {
      case "save":
        await manualSaveDocument();
        break;
      case "quit":
        runShortcutAction("exit");
        break;
      case "saveAndQuit":
        await manualSaveDocument();
        runShortcutAction("exit");
        break;
      case "open": {
        const path = findDocumentByStem(command.title);
        if (path) openDocument(path);
        else showToast(`No note found for "${command.title}"`);
        break;
      }
      case "new":
        await createDocumentAtSelection(command.title);
        break;
      case "darkMode":
        settingsStore.value.theme_preference = command.choice;
        settingsStore.value = { ...settingsStore.value };
        saveSettingsDebounced();
        applyTheme();
        break;
      case "colorTheme":
        settingsStore.value.color_theme = command.id;
        settingsStore.value = { ...settingsStore.value };
        saveSettingsDebounced();
        applyTheme();
        break;
      case "git":
        await executeGit(command.command);
        break;
      case "find":
        openFindReplace(command.query || undefined);
        break;
      case "tag":
        dockLayoutRegistry.api?.ensurePanelOpen("tags");
        if (command.query) requestTagFilter(command.query);
        break;
      case "toggleSpellCheck":
        runShortcutAction("toggle_spell_check");
        break;
      case "daily":
        openDailyNote();
        break;
      case "plugin":
        await runPluginCommand(command.name, command.arg);
        break;
    }
  }

  async function run() {
    const result = parseCommand(input, pluginCommands);
    if (!result.ok) {
      error = result.error;
      return;
    }
    error = null;
    await execute(result.command);
    onClose();
  }

  function acceptSuggestion(suggestion: string) {
    input = applyCompletion(input, suggestion);
    selected = 0;
    error = null;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (suggestions.length) selected = (selected + 1) % suggestions.length;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (suggestions.length) selected = (selected - 1 + suggestions.length) % suggestions.length;
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (suggestions.length) acceptSuggestion(suggestions[Math.min(selected, suggestions.length - 1)]);
    } else if (e.key === "Enter") {
      run();
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
    <div class="input-row">
      <span class="colon">:</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        type="text"
        placeholder="write, open <title>, theme <name>, git commit, tag <name>, ..."
        bind:value={input}
        oninput={() => {
          selected = 0;
          error = null;
        }}
        autofocus
      />
    </div>
    {#if error}
      <p class="error">{error}</p>
    {/if}
    {#if suggestions.length}
      <div class="suggestions">
        {#each suggestions as suggestion, i (suggestion)}
          <button class:selected={i === selected} onclick={() => acceptSuggestion(suggestion)}>
            {suggestion}
          </button>
        {/each}
      </div>
    {/if}
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
    width: 32rem;
    max-width: 90vw;
    background: var(--color-bg);
    border-radius: 6px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .input-row {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.6rem 0.8rem;
    border-bottom: 1px solid var(--color-border);
  }

  .colon {
    color: var(--color-fg-muted);
    font-weight: bold;
  }

  input {
    flex: 1;
    border: none;
    font-size: 0.95rem;
  }

  input:focus {
    outline: none;
  }

  .error {
    margin: 0;
    padding: 0.4rem 0.8rem;
    color: var(--color-danger);
    font-size: 0.8rem;
  }

  .suggestions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    padding: 0.5rem 0.8rem;
  }

  .suggestions button {
    background: var(--color-selected-bg);
    border: none;
    border-radius: 999px;
    padding: 0.15rem 0.6rem;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .suggestions button.selected {
    background: var(--color-accent);
    color: white;
  }
</style>
