<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { project } from "../stores/project.svelte";
  import { humanizeAge } from "../humanizeAge";

  // Dirty files, recent commit log, and a live log of this session's own
  // git actions (`git_ops::GitActivityState`, server-held since — unlike
  // every other panel query here — "what did this session try" isn't
  // something disk remembers on its own).
  type Commit = { hash: string; author: string; relative_date: string; subject: string };
  type GitActivityEntry = {
    at_unix: number;
    message: string;
    outcome: "success" | "neutral" | "error";
    files: string[];
  };
  type VersionActivity = {
    git_available: boolean;
    dirty_files: string[];
    commits: Commit[];
    activity: GitActivityEntry[];
  };

  let activity = $state<VersionActivity | null>(null);
  let error = $state<string | null>(null);

  // Re-render every 30s so each entry's "X ago" age stays fresh without a
  // refetch — same pattern SyncPanel.svelte's own `now`/`tick` uses.
  let now = $state(Date.now());
  let tick: ReturnType<typeof setInterval> | undefined;

  onMount(() => {
    refresh();
    tick = setInterval(() => (now = Date.now()), 30_000);
  });

  onDestroy(() => {
    clearInterval(tick);
  });

  async function refresh() {
    try {
      activity = await invoke<VersionActivity>("version_activity", { root: project.value!.root });
    } catch (err) {
      error = String(err);
    }
  }

  function age(entry: GitActivityEntry): string {
    return humanizeAge(Math.max(0, Math.floor(now / 1000 - entry.at_unix)));
  }
</script>

<div class="panel">
  <button onclick={refresh}>Refresh</button>
  {#if error}<p class="error">{error}</p>{/if}
  {#if activity}
    {#if !activity.git_available}
      <p class="empty">Git integration isn't turned on for this project.</p>
    {:else}
      <h3>Dirty files ({activity.dirty_files.length})</h3>
      <ul class="dirty">
        {#each activity.dirty_files as file (file)}
          <li>{file}</li>
        {/each}
      </ul>
      <h3>Recent commits</h3>
      <ul class="commits">
        {#each activity.commits as commit (commit.hash)}
          <li>
            <code>{commit.hash.slice(0, 7)}</code>
            <span class="subject">{commit.subject}</span>
            <span class="meta">{commit.author}, {commit.relative_date}</span>
          </li>
        {/each}
      </ul>
      <h3>Activity</h3>
      {#if activity.activity.length === 0}
        <p class="empty">Nothing yet this session.</p>
      {:else}
        <ul class="activity">
          {#each activity.activity as entry (entry.at_unix + entry.message)}
            <li>
              <div class="activity-line">
                <span class="meta">{age(entry)}</span>
                <span class="outcome-{entry.outcome}">{entry.message}</span>
              </div>
              {#if entry.files.length > 0}
                <details>
                  <summary>{entry.files.length} files</summary>
                  <ul class="files">
                    {#each entry.files as file (file)}
                      <li class="meta">{file}</li>
                    {/each}
                  </ul>
                </details>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .panel {
    height: 100%;
    overflow: auto;
    padding: 0.5rem;
    box-sizing: border-box;
  }

  h3 {
    font-size: 0.85rem;
    color: var(--color-fg-muted);
    margin: 0.75rem 0 0.25rem;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    font-size: 0.85rem;
  }

  .commits li {
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
    padding: 0.15rem 0;
  }

  .subject {
    flex: 1;
  }

  .meta {
    color: var(--color-fg-muted);
    font-size: 0.75rem;
  }

  .empty {
    color: var(--color-fg-muted);
  }

  .activity li {
    padding: 0.25rem 0;
  }

  .activity-line {
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
  }

  /* Success stays the default text color — only Neutral/Error get a
     distinct treatment — matching version_activity_panel.rs's own
     `None`/weak/error_fg_color mapping. */
  .outcome-neutral {
    color: var(--color-fg-muted);
  }

  .outcome-error {
    color: var(--color-danger);
  }

  details {
    margin: 0.15rem 0 0 2.6rem;
  }

  summary {
    cursor: pointer;
    color: var(--color-fg-muted);
    font-size: 0.75rem;
  }

  .files {
    margin: 0.15rem 0 0;
    padding-left: 0.5rem;
  }

  .error {
    color: var(--color-danger);
  }
</style>
