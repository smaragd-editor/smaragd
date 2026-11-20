import { invoke } from "@tauri-apps/api/core";

// The non-reactive half of vault sync's frontend integration: project-open/
// close/save hooks that fire regardless of whether the Sync panel happens to
// be mounted (dockview fully unmounts a closed panel — see
// DockLayout.svelte's svelteContentRenderer — so the panel itself can't be
// where "start the runner when a project opens" lives). The panel's own
// phase/devices/ticket UI state stays local to SyncPanel.svelte instead,
// refetched via `vault_status` on mount, same convention CollabPanel.svelte
// already uses for the analogous collab session.

/** The path last sent to `vault_set_held`, so a no-op change (e.g. opening
 * the same document twice) doesn't re-invoke the backend. */
let heldPath: string | null = null;

/** Starts the background runner for `root` if sync is enabled and this
 * project is paired — a silent no-op otherwise (not an error the caller
 * needs to handle): the Sync panel's own `vault_status` check explains why
 * whenever it's actually open. */
export async function vaultStartIfConfigured(root: string): Promise<void> {
  try {
    await invoke("vault_start", { root });
  } catch {
    // Not paired / sync disabled / misconfigured — nothing to surface here.
  }
}

export async function vaultStop(): Promise<void> {
  heldPath = null;
  try {
    await invoke("vault_stop");
  } catch {
    // Nothing was running — fine.
  }
}

/** Tells the engine which (if any) file currently has unsaved edits, so a
 * sync pass holds it rather than overwriting the open buffer — mirrors the
 * real app's own `sync_update_held`/`sync_after_save`. This port only ever
 * has one resident open document, so the held set is 0-or-1 paths, not a
 * `Set` the way the real app's multi-tab model needs. */
export function vaultUpdateHeld(root: string, path: string | null, dirty: boolean): void {
  const next = dirty ? path : null;
  if (next === heldPath) return;
  heldPath = next;
  invoke("vault_set_held", { root, paths: next ? [next] : [] }).catch(() => {});
}

/** Releases whatever this document was holding and asks for an immediate
 * sync pass — called right after a successful save, never after a failed
 * one (the file is still genuinely unsaved then). */
export function vaultAfterSave(root: string, path: string): void {
  vaultUpdateHeld(root, path, false);
  invoke("vault_sync_now").catch(() => {});
}
