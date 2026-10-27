<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { project } from "./stores/project.svelte";
  import { showToast } from "./stores/toast.svelte";

  // Backs the Add Note at Cursor shortcut (requestNoteAtCursor,
  // MarkdownEditor.svelte's CodeMirror keymap) — the Tauri-port counterpart
  // of the real egui app's note_prompt.rs, pre-filled from any note already
  // at that exact (line, column) so the shortcut edits in place rather than
  // always starting blank. Saving empty text deletes the note instead of
  // leaving a blank one behind, matching core::project::Project::upsert_note.
  let { onClose, path, line, column }: { onClose: () => void; path: string; line: number; column: number } =
    $props();

  let text = $state("");
  let loading = $state(true);
  let error = $state<string | null>(null);
  let busy = $state(false);

  onMount(async () => {
    if (!project.value) return;
    try {
      text = (await invoke<string | null>("note_text_at", {
        root: project.value.root,
        path,
        line,
        column,
      })) ?? "";
    } catch (err) {
      error = String(err);
    } finally {
      loading = false;
    }
  });

  async function save() {
    if (!project.value) return;
    busy = true;
    error = null;
    try {
      await invoke("note_upsert", { root: project.value.root, path, line, column, text });
      onClose();
    } catch (err) {
      error = String(err);
    } finally {
      busy = false;
    }
  }

  async function deleteNote() {
    if (!project.value) return;
    busy = true;
    try {
      await invoke("note_upsert", { root: project.value.root, path, line, column, text: "" });
      showToast("Note deleted");
      onClose();
    } catch (err) {
      error = String(err);
      busy = false;
    }
  }
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && !busy && onClose()} />

<div
  class="backdrop"
  onclick={() => !busy && onClose()}
  onkeydown={(e) => e.key === "Escape" && !busy && onClose()}
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
    <h2>Note at line {line}</h2>
    <textarea bind:value={text} rows="6" disabled={loading} placeholder="Note text…"></textarea>
    {#if error}<p class="error">{error}</p>{/if}
    <div class="footer">
      <button onclick={deleteNote} disabled={busy || loading}>Delete</button>
      <div class="spacer"></div>
      <button onclick={onClose} disabled={busy}>Cancel</button>
      <button onclick={save} disabled={busy || loading}>{busy ? "Saving…" : "Save"}</button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    width: 28rem;
    background: var(--color-bg);
    border-radius: 6px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  h2 {
    margin: 0;
    font-size: 1.1rem;
  }

  textarea {
    font-size: 0.85rem;
    padding: 0.5rem;
  }

  .footer {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .spacer {
    flex: 1;
  }

  .error {
    color: var(--color-danger);
    font-size: 0.8rem;
  }
</style>
