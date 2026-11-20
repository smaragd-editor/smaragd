// The collab status every interested module needs to read, split out from
// stores/collab.svelte.ts (which owns the actual host/join/end logic and
// the "collab://event" listener) to avoid a dependency cycle:
// project.svelte.ts reads `collabStatus` to decide whether a local edit
// should also sync to a peer, while collab.svelte.ts calls back *into*
// project.svelte.ts (`applyRemoteCollabEdit`) to merge a remote edit into
// the real open document when hosting. A session-end *request* (e.g.
// "the user switched documents while hosting") needs to flow the other
// way — project.svelte.ts into collab.svelte.ts — without creating that
// cycle either, hence `registerCollabEndHandler`/`requestCollabSessionEnd`,
// the same indirection `dockLayoutRegistry.api` already uses elsewhere in
// this codebase for one module to call into another it can't statically
// import.
export type CollabStatus = {
  active: boolean;
  role: "host" | "joiner" | null;
  code: string | null;
  peer_connected: boolean;
  reconnecting: boolean;
  peer_fingerprint: string | null;
  session_ended: boolean;
};

export function defaultCollabStatus(): CollabStatus {
  return {
    active: false,
    role: null,
    code: null,
    peer_connected: false,
    reconnecting: false,
    peer_fingerprint: null,
    session_ended: false,
  };
}

export const collabStatus = $state<CollabStatus>(defaultCollabStatus());

let endSessionHandler: ((reason: string) => void) | undefined;

export function registerCollabEndHandler(handler: (reason: string) => void) {
  endSessionHandler = handler;
}

export function requestCollabSessionEnd(reason: string) {
  endSessionHandler?.(reason);
}
