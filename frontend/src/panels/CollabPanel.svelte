<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { writeText } from "@tauri-apps/plugin-clipboard-manager";
  import { collabStatus } from "../stores/collabStatus.svelte";
  import {
    collabJoiner,
    endCollabSession,
    initCollabListener,
    setCollabError,
    startCollabHost,
    startCollabJoin,
  } from "../stores/collab.svelte";

  // Real push-event collab (app-tauri/src/collab.rs's wake-driven drain-
  // thread architecture), wired directly into the Editor panel's own
  // CodeMirror buffer — see stores/collab.svelte.ts's module doc comment
  // for exactly how hosting vs. joining differ. This panel now only owns
  // the host/join/status UI; the shared text itself lives and is edited
  // in the Editor panel for the duration of a session.
  let joinCode = $state("");

  let unlisten: (() => void) | undefined;

  onMount(async () => {
    unlisten = await initCollabListener();
  });

  onDestroy(() => {
    unlisten?.();
  });

  async function host() {
    setCollabError(await startCollabHost());
  }

  async function join() {
    setCollabError(await startCollabJoin(joinCode));
  }

  async function end() {
    await endCollabSession();
  }

  // Phase 7: arboard -> @tauri-apps/plugin-clipboard-manager. The host code
  // is a long opaque string meant to be pasted by a peer — copying it by
  // hand would be the whole UX friction point of this flow.
  let copied = $state(false);
  async function copyCode() {
    if (!collabStatus.code) return;
    await writeText(collabStatus.code);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }
</script>

<div class="collab">
  {#if !collabStatus.active}
    <div class="start">
      <button onclick={host}>Host a session</button>
      <p class="hint">Edits sync in the Editor panel — open a document first.</p>
      <div class="join">
        <input type="text" placeholder="Paste a connection code" bind:value={joinCode} />
        <button onclick={join} disabled={!joinCode}>Join</button>
      </div>
    </div>
  {:else}
    <div class="status-bar">
      <span>Role: {collabStatus.role}</span>
      {#if collabStatus.code}
        <span>Code: <code>{collabStatus.code}</code></span>
        <button onclick={copyCode}>{copied ? "Copied" : "Copy"}</button>
      {/if}
      {#if collabStatus.peer_connected}
        <span class="ok"
          >Peer connected{collabStatus.peer_fingerprint
            ? ` (${collabStatus.peer_fingerprint})`
            : ""}</span
        >
      {:else if collabStatus.reconnecting}
        <span class="warn">Reconnecting…</span>
      {:else if collabStatus.session_ended}
        <span class="warn">Session ended</span>
      {:else}
        <span>Waiting for peer…</span>
      {/if}
      <button onclick={end}>End session</button>
    </div>
    <p class="hint">
      {collabStatus.role === "host"
        ? "Shared in the Editor panel — your edits sync to your peer."
        : "Shared in the Editor panel — editing it syncs to your peer."}
    </p>
  {/if}
  {#if collabJoiner.error}<p class="error">{collabJoiner.error}</p>{/if}
</div>

<style>
  .collab {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.5rem;
    box-sizing: border-box;
  }

  .start {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    align-items: flex-start;
  }

  .join {
    display: flex;
    gap: 0.5rem;
  }

  .status-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
    font-size: 0.85rem;
  }

  .hint {
    margin: 0;
    font-size: 0.8rem;
    color: var(--color-fg-muted);
  }

  .ok {
    color: var(--color-success);
  }

  .warn {
    color: var(--color-warning);
  }

  .error {
    color: var(--color-danger);
  }
</style>
