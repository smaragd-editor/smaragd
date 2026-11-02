<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import { writeText } from "@tauri-apps/plugin-clipboard-manager";
  import { project } from "../stores/project.svelte";
  import { settingsStore, resolveSyncServerPort } from "../stores/settings.svelte";
  import { requestSettings } from "../stores/settingsRequest.svelte";
  import { showPrompt, showConfirm } from "../stores/promptDialog.svelte";

  // Real multi-device vault sync — replaces Phase 6's demo mode (a
  // SyncRunner against an in-memory fake vault). Backed by
  // app-tauri/src/vault.rs, which wraps core::sync::{pairing,runner,link}
  // directly; this component mirrors the real egui app's own
  // ui/sync_panel.rs phase-by-phase, the same way CollabPanel.svelte
  // mirrors collab_panel.rs — status refetched via `vault_status` on
  // mount (since dockview fully unmounts a closed panel), then kept live
  // by listening on "vault://event".
  type VaultStatus = { paired: boolean; server: string | null; own_device_id: string | null };
  type DeviceInfo = {
    device_id: string;
    name: string;
    created_at_unix: number;
    last_seen_unix: number | null;
    paired_by: string | null;
  };
  type VaultEvent =
    | { kind: "Syncing" }
    | {
        kind: "Synced";
        summary: string | null;
        too_large_message: string | null;
        over_limit_message: string | null;
        too_large_to_download_message: string | null;
        meta_written: boolean;
      }
    | { kind: "Offline"; message: string }
    | { kind: "Failed"; message: string }
    | { kind: "Halted"; reason: string; message: string };

  type RunnerPhase = "starting" | "syncing" | "up_to_date" | "offline" | "halted";
  type Phase = "off" | "no_project" | "needs_settings" | "not_paired" | RunnerPhase;

  let status = $state<VaultStatus>({ paired: false, server: null, own_device_id: null });
  let runnerPhase = $state<RunnerPhase>("starting");
  let lastSyncedAt = $state<number | null>(null);
  let activity = $state<string | null>(null);
  let offlineMessage = $state<string | null>(null);
  let haltedMessage = $state<string | null>(null);
  let notice = $state<string | null>(null);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let ticket = $state<string | null>(null);
  let copied = $state(false);
  let devices = $state<DeviceInfo[] | null>(null);

  let joining = $state(false);
  let joinTicketText = $state("");
  let pendingJoin = $state<{ server: string; plainHttp: boolean } | null>(null);

  /** Cheap client-side mirror of `Settings::sync_config_problem` — just
   * enough to decide whether to show "needs_settings" here; the backend
   * (`vault_start`) is still the authority that actually blocks starting
   * with a bad config. */
  function syncConfigProblem(): string | null {
    if (!settingsStore.value.sync_server_host.trim()) {
      return "Enter the sync server's host name in Settings > Sync.";
    }
    if (!settingsStore.value.sync_passphrase) {
      return "Enter your encryption passphrase in Settings > Sync.";
    }
    return null;
  }

  const phase = $derived.by<Phase>(() => {
    if (!project.value) return "no_project";
    if (!settingsStore.value.sync_enabled) return "off";
    if (syncConfigProblem()) return "needs_settings";
    if (!status.paired) return "not_paired";
    return runnerPhase;
  });

  let now = $state(Date.now());
  let tick: ReturnType<typeof setInterval> | undefined;

  function humanizeAge(seconds: number): string {
    if (seconds <= 44) return "just now";
    if (seconds <= 3599) return `${Math.floor((seconds + 30) / 60)} min ago`;
    if (seconds <= 86399) return `${Math.floor((seconds + 1800) / 3600)} h ago`;
    return `${Math.floor((seconds + 43200) / 86400)} days ago`;
  }

  const lastSyncedLabel = $derived(
    lastSyncedAt ? humanizeAge(Math.floor((now - lastSyncedAt) / 1000)) : "",
  );

  async function refreshStatus() {
    if (!project.value) return;
    try {
      status = await invoke<VaultStatus>("vault_status", { root: project.value.root });
    } catch (err) {
      error = String(err);
    }
  }

  function handleEvent(payload: VaultEvent) {
    switch (payload.kind) {
      case "Syncing":
        runnerPhase = "syncing";
        break;
      case "Synced":
        runnerPhase = "up_to_date";
        lastSyncedAt = Date.now();
        activity = payload.summary;
        notice =
          payload.too_large_message ??
          payload.over_limit_message ??
          payload.too_large_to_download_message ??
          null;
        break;
      case "Offline":
        runnerPhase = "offline";
        offlineMessage = payload.message;
        break;
      case "Failed":
        notice = payload.message;
        break;
      case "Halted":
        runnerPhase = "halted";
        haltedMessage = payload.message;
        break;
    }
  }

  let unlisten: (() => void) | undefined;

  onMount(async () => {
    await refreshStatus();
    unlisten = await listen<VaultEvent>("vault://event", (event) => handleEvent(event.payload));
    tick = setInterval(() => (now = Date.now()), 30_000);
  });

  onDestroy(() => {
    unlisten?.();
    clearInterval(tick);
  });

  function openSyncSettings() {
    requestSettings("Sync");
  }

  function deviceNameOrDefault(): string {
    return settingsStore.value.sync_device_name.trim() || `Smaragd on ${navigator.platform}`;
  }

  async function afterPaired() {
    joining = false;
    pendingJoin = null;
    await refreshStatus();
    if (!project.value) return;
    try {
      await invoke("vault_start", { root: project.value.root });
    } catch (err) {
      error = String(err);
    }
  }

  async function runCreateVault(adminToken?: string) {
    if (!project.value) return;
    const result = await invoke<
      | { kind: "Paired"; server: string; vault_id: string; own_device_id: string }
      | { kind: "NeedsAdminToken" }
    >("vault_create", {
      root: project.value.root,
      host: settingsStore.value.sync_server_host.trim(),
      port: resolveSyncServerPort(settingsStore.value),
      useTls: !settingsStore.value.sync_plain_http,
      path: settingsStore.value.sync_server_path.trim().replace(/^\/+|\/+$/g, ""),
      adminToken: adminToken ?? null,
      deviceName: deviceNameOrDefault(),
    });
    if (result.kind === "NeedsAdminToken") {
      const token = await showPrompt("This server requires an admin token to create a vault:");
      if (token) await runCreateVault(token);
      return;
    }
    await afterPaired();
  }

  async function createVault() {
    error = null;
    busy = true;
    try {
      await runCreateVault();
    } catch (err) {
      error = String(err);
    } finally {
      busy = false;
    }
  }

  function startJoining() {
    joining = true;
    joinTicketText = "";
    pendingJoin = null;
    error = null;
  }

  function cancelJoining() {
    joining = false;
    pendingJoin = null;
  }

  async function previewTicket() {
    error = null;
    try {
      const preview = await invoke<{ server: string; plain_http: boolean }>("vault_decode_ticket", {
        ticket: joinTicketText.trim(),
      });
      pendingJoin = { server: preview.server, plainHttp: preview.plain_http };
    } catch (err) {
      error = String(err);
    }
  }

  async function confirmJoin() {
    if (!project.value) return;
    busy = true;
    error = null;
    try {
      await invoke("vault_join", {
        root: project.value.root,
        ticket: joinTicketText.trim(),
        deviceName: deviceNameOrDefault(),
      });
      await afterPaired();
    } catch (err) {
      error = String(err);
    } finally {
      busy = false;
    }
  }

  function syncNow() {
    invoke("vault_sync_now").catch(() => {});
  }

  async function retry() {
    if (!project.value) return;
    error = null;
    haltedMessage = null;
    runnerPhase = "starting";
    try {
      await invoke("vault_start", { root: project.value.root });
    } catch (err) {
      error = String(err);
    }
  }

  async function makeTicket() {
    if (!project.value) return;
    busy = true;
    error = null;
    try {
      ticket = await invoke<string>("vault_make_ticket", { root: project.value.root });
    } catch (err) {
      error = String(err);
    } finally {
      busy = false;
    }
  }

  async function copyTicket() {
    if (!ticket) return;
    await writeText(ticket);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }

  async function refreshDevices() {
    if (!project.value) return;
    busy = true;
    error = null;
    try {
      devices = await invoke<DeviceInfo[]>("vault_list_devices", { root: project.value.root });
    } catch (err) {
      error = String(err);
    } finally {
      busy = false;
    }
  }

  async function revokeDevice(deviceId: string) {
    if (!project.value) return;
    if (!(await showConfirm("Revoke this device? It stops syncing immediately."))) return;
    busy = true;
    error = null;
    try {
      await invoke("vault_revoke_device", { root: project.value.root, deviceId });
      await refreshDevices();
    } catch (err) {
      error = String(err);
    } finally {
      busy = false;
    }
  }

  async function leaveVault() {
    if (!project.value) return;
    if (
      !(await showConfirm(
        "Stop syncing this project? Your files stay exactly as they are here, and the other devices keep their copies.",
      ))
    ) {
      return;
    }
    busy = true;
    error = null;
    try {
      await invoke("vault_leave", { root: project.value.root });
      status = { paired: false, server: null, own_device_id: null };
      ticket = null;
      devices = null;
      notice = null;
      runnerPhase = "starting";
    } catch (err) {
      error = String(err);
    } finally {
      busy = false;
    }
  }

  function pairedByLabel(device: DeviceInfo, all: DeviceInfo[]): string | null {
    if (!device.paired_by) return null;
    const pairer = all.find((d) => d.device_id === device.paired_by);
    return pairer ? `added by ${pairer.name}` : "added by a removed device";
  }

  function deviceLastSeen(device: DeviceInfo): string {
    if (device.last_seen_unix === null) return "never seen";
    return humanizeAge(Math.floor(Date.now() / 1000 - device.last_seen_unix));
  }
</script>

<div class="sync">
  {#if phase === "off"}
    <p>Sync is turned off.</p>
    <p class="weak">Turn it on, and set your server and passphrase, in Settings &gt; Sync.</p>
    <button onclick={openSyncSettings}>Open Settings</button>
  {:else if phase === "no_project"}
    <p>Open a project to sync it.</p>
  {:else if phase === "needs_settings"}
    <p>{syncConfigProblem()}</p>
    <button onclick={openSyncSettings}>Open Settings</button>
  {:else if phase === "not_paired" && !joining}
    <p>This project isn't syncing yet.</p>
    <p class="weak">
      Create a vault to start syncing it, or join a vault you already have on another device
      with a pairing ticket.
    </p>
    <div class="row">
      <button disabled={busy} onclick={createVault}>Create Vault…</button>
      <button disabled={busy} onclick={startJoining}>Join Vault…</button>
    </div>
    {#if busy}<p class="weak">Contacting the server…</p>{/if}
  {:else if joining}
    {#if pendingJoin}
      <p>Join the vault on this server?</p>
      <p class="server">{pendingJoin.server}</p>
      {#if pendingJoin.plainHttp}
        <p class="warn">
          This ticket uses plain HTTP: this device's token would travel unencrypted. Your text
          stays encrypted, but only continue on a network you trust.
        </p>
      {/if}
      <p class="weak">
        Joining uploads this project to that server, encrypted with your passphrase. Only
        continue if the ticket came from one of your own devices and this is your server.
      </p>
      <div class="row">
        <button disabled={busy} onclick={confirmJoin}>Join</button>
        <button disabled={busy} onclick={cancelJoining}>Cancel</button>
      </div>
      {#if busy}<p class="weak">Contacting the server…</p>{/if}
    {:else}
      <p>Paste a pairing ticket from another device:</p>
      <textarea rows="3" bind:value={joinTicketText} placeholder="Pairing ticket…"></textarea>
      <div class="row">
        <button disabled={!joinTicketText.trim()} onclick={previewTicket}>Next</button>
        <button onclick={cancelJoining}>Cancel</button>
      </div>
    {/if}
  {:else}
    <div class="status-row">
      <span
        class="dot"
        class:ok={phase === "up_to_date"}
        class:warn={phase === "offline"}
        class:bad={phase === "halted"}
      ></span>
      <span>
        {#if phase === "starting"}
          Starting…
        {:else if phase === "syncing"}
          Syncing…
        {:else if phase === "up_to_date"}
          Up to date — synced {lastSyncedLabel}
        {:else if phase === "offline"}
          Offline — changes are saved and will sync when the server is reachable
        {:else if phase === "halted"}
          {haltedMessage}
        {/if}
      </span>
    </div>
    {#if phase === "offline" && offlineMessage}<p class="weak">{offlineMessage}</p>{/if}
    {#if status.server}<p class="weak">Server: {status.server}</p>{/if}
    {#if activity}<p class="weak">{activity}</p>{/if}

    <div class="row">
      {#if phase === "halted"}
        <button onclick={retry}>Retry</button>
        <button onclick={openSyncSettings}>Open Settings</button>
      {:else}
        <button disabled={phase !== "up_to_date" && phase !== "offline"} onclick={syncNow}>
          Sync Now
        </button>
      {/if}
    </div>

    <hr />
    <p class="weak">
      Also syncing images, PDFs and other files? Configure in Project Settings &gt; Sync.
    </p>

    <hr />
    <h4>Add another device</h4>
    <p class="weak">
      Make a pairing ticket, paste it into Smaragd on the other device (Sync panel &gt; Join
      Vault…), and use the same passphrase there. A ticket works once and expires after 10
      minutes.
    </p>
    <button disabled={busy} onclick={makeTicket}>Make Pairing Ticket</button>
    {#if ticket}
      <div class="row">
        <textarea readonly rows="2" value={ticket}></textarea>
        <button onclick={copyTicket}>{copied ? "Copied" : "Copy"}</button>
      </div>
    {/if}

    <hr />
    <div class="row">
      <h4>Devices</h4>
      <button disabled={busy} onclick={refreshDevices}>Refresh</button>
    </div>
    {#if devices === null}
      <p class="weak">Press Refresh to list the devices in this vault.</p>
    {:else if devices.length === 0}
      <p class="weak">No devices found.</p>
    {:else}
      <ul class="devices">
        {#each devices as device (device.device_id)}
          <li>
            <span>
              {device.name}{device.device_id === status.own_device_id ? " (this device)" : ""}
            </span>
            <span class="weak">{deviceLastSeen(device)}</span>
            {#if pairedByLabel(device, devices)}
              <span class="weak">{pairedByLabel(device, devices)}</span>
            {/if}
            {#if device.device_id !== status.own_device_id}
              <button disabled={busy} onclick={() => revokeDevice(device.device_id)}>Revoke</button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    <hr />
    <details>
      <summary>Stop syncing this project</summary>
      <p class="weak">
        Removes this device from the vault and stops syncing this project. Your files stay
        exactly as they are here, and the other devices keep their copies.
      </p>
      <button disabled={busy} onclick={leaveVault}>Stop Syncing This Project</button>
    </details>
  {/if}
  {#if notice}<p class="notice">{notice}</p>{/if}
  {#if error}<p class="error">{error}</p>{/if}
</div>

<style>
  .sync {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    box-sizing: border-box;
    overflow: auto;
    font-size: 0.85rem;
  }

  .sync p {
    margin: 0;
  }

  .weak {
    color: var(--color-fg-muted);
    font-size: 0.8rem;
  }

  .warn {
    color: var(--color-warning);
  }

  .server {
    font-weight: bold;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }

  .status-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .dot {
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    background: var(--color-fg-muted);
    flex-shrink: 0;
  }

  .dot.ok {
    background: var(--color-success);
  }

  .dot.warn {
    background: var(--color-warning);
  }

  .dot.bad {
    background: var(--color-danger);
  }

  textarea {
    flex: 1;
    font-family: inherit;
    font-size: 0.8rem;
    padding: 0.4rem;
    resize: vertical;
  }

  hr {
    width: 100%;
    border: none;
    border-top: 1px solid var(--color-border);
    margin: 0.25rem 0;
  }

  h4 {
    margin: 0;
    font-size: 0.85rem;
  }

  .devices {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .devices li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }

  details {
    font-size: 0.85rem;
  }

  details > p,
  details > button {
    margin-top: 0.4rem;
  }

  .notice {
    color: var(--color-warning);
  }

  .error {
    color: var(--color-danger);
  }
</style>
