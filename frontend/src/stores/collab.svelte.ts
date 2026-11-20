import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  collabStatus,
  defaultCollabStatus,
  registerCollabEndHandler,
} from "./collabStatus.svelte";
import { project, applyRemoteCollabEdit, applyRemoteTextToEditor } from "./project.svelte";
import { showToast } from "./toast.svelte";
import type { TextChange } from "../collabSync";

// Wires collaboration into the real editor instead of CollabPanel's own
// standalone textarea: hosting collaborates on whatever document is
// already open (`project.documentText`, merged via
// `applyRemoteCollabEdit`/synced via `onEditorChange`'s own hook — see
// project.svelte.ts), while joining has no open document to collaborate
// through, so it gets a dedicated ephemeral buffer (`collabJoiner.text`)
// that EditorPanel.svelte shows instead of the normal document view for
// as long as the session lasts.
//
// This listener only runs while CollabPanel.svelte is mounted (same
// "dockview fully unmounts a closed panel" constraint SyncPanel.svelte's
// own vault://event listener already lives with) — so, unlike vault sync
// (which keeps running server-side regardless), live collab updates stop
// reaching the editor if the Collab panel is closed mid-session. Keeping
// it open for the duration of a session is the expected usage; making
// this survive the panel closing would need an app-level listener this
// codebase doesn't have a precedent for yet.
type CollabUpdate =
  | { kind: "HostReady"; code: string }
  | { kind: "TextChanged"; new_text: string; change: TextChange }
  | { kind: "PeerConnected"; fingerprint: string }
  | { kind: "Reconnecting" }
  | { kind: "PeerDisconnected" }
  | { kind: "Error"; message: string };

/** Svelte 5 forbids reassigning an *exported* `$state` binding directly
 * (`state_invalid_export`) — only mutating an exported state value's own
 * properties is allowed, same reason `stores/toast.svelte.ts`'s `toast` is
 * an object rather than two loose exported primitives. */
export const collabJoiner = $state<{ text: string; error: string | null }>({
  text: "",
  error: null,
});

export function setCollabError(message: string | null) {
  collabJoiner.error = message;
}

function setStatus(patch: Partial<typeof collabStatus>) {
  Object.assign(collabStatus, patch);
}

export async function refreshCollabStatus() {
  setStatus(await invoke<typeof collabStatus>("collab_status"));
}

export async function startCollabHost(): Promise<string | null> {
  if (!project.selectedPath) {
    return "Open a document before hosting a collaboration session";
  }
  try {
    await invoke("collab_host");
    setStatus({ active: true, role: "host" });
    // `CollabSession::host` starts empty — bootstrap it from the live
    // buffer rather than waiting for the user's next keystroke, matching
    // the real app's `sync_local_collab_edit` running unconditionally
    // every frame from the moment hosting starts.
    await invoke("collab_sync_local_edit", { text: project.documentText });
    return null;
  } catch (err) {
    return String(err);
  }
}

export async function startCollabJoin(code: string): Promise<string | null> {
  try {
    await invoke("collab_join", { code });
    collabJoiner.text = "";
    setStatus({ active: true, role: "joiner" });
    return null;
  } catch (err) {
    return String(err);
  }
}

export async function endCollabSession(reason = "Collaboration session ended") {
  if (!collabStatus.active) return;
  await invoke("collab_end");
  Object.assign(collabStatus, defaultCollabStatus());
  collabJoiner.text = "";
  showToast(reason);
}

registerCollabEndHandler((reason) => void endCollabSession(reason));

let joinerSyncTimer: ReturnType<typeof setTimeout> | undefined;

/** The joiner's half of `onEditorChange`: no document to autosave, so
 * local edits only ever sync to the peer. */
export function onCollabJoinerChange(text: string) {
  collabJoiner.text = text;
  clearTimeout(joinerSyncTimer);
  joinerSyncTimer = setTimeout(() => {
    void invoke("collab_sync_local_edit", { text });
  }, 300);
}

let unlisten: (() => void) | undefined;

/** Starts the `collab://event` listener — called from CollabPanel.svelte's
 * `onMount`; see this module's own doc comment on why that panel has to
 * stay open for updates to keep reaching the editor. Safe to call more
 * than once (e.g. the panel remounting): a previous listener is torn down
 * first. */
export async function initCollabListener(): Promise<() => void> {
  unlisten?.();
  await refreshCollabStatus();
  unlisten = await listen<CollabUpdate>("collab://event", (event) => {
    const update = event.payload;
    switch (update.kind) {
      case "HostReady":
        setStatus({ code: update.code });
        break;
      case "TextChanged":
        if (collabStatus.role === "host") {
          applyRemoteCollabEdit(update.new_text, update.change);
        } else {
          collabJoiner.text = update.new_text;
          applyRemoteTextToEditor(update.new_text, update.change);
        }
        break;
      case "PeerConnected":
        setStatus({ peer_connected: true, reconnecting: false, peer_fingerprint: update.fingerprint });
        break;
      case "Reconnecting":
        setStatus({ peer_connected: false, reconnecting: true });
        break;
      case "PeerDisconnected":
        setStatus({ peer_connected: false, reconnecting: false, session_ended: true });
        break;
      case "Error":
        setCollabError(update.message);
        break;
    }
  });
  return () => unlisten?.();
}
