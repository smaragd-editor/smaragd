<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { project } from "../stores/project.svelte";

  // Matches the real app's dashboard_panel.rs: the summary grid, the four
  // last-60-days bar charts (word count/sessions/documents created/
  // documents modified), and the two Words-or-Time activity charts (by day
  // of week, by hour of day). The real app renders all six with egui_plot;
  // this port uses plain inline SVG instead — six fixed, non-interactive
  // bar charts (no pan/zoom there either — see day_bar_chart's own doc
  // comment) don't need a whole charting library pulled in just for them.
  // One simplification: the day-window charts only label every ~10th bar
  // along the x-axis (plus the last day) rather than egui_plot's own
  // auto-spaced ticks — the rest are still reachable via each bar's native
  // <title> hover tooltip.
  type DayBucket = { label: string; value: number };
  type Dashboard = {
    session_count: number;
    total_minutes: number;
    total_words: number;
    documents_created: number;
    word_counts: DayBucket[];
    sessions: DayBucket[];
    documents_created_by_day: DayBucket[];
    documents_modified_by_day: DayBucket[];
    weekday_words: number[];
    weekday_minutes: number[];
    hour_words: number[];
    hour_minutes: number[];
  };

  let dashboard = $state<Dashboard | null>(null);
  let error = $state<string | null>(null);
  let metric = $state<"words" | "time">("words");

  onMount(async () => {
    try {
      dashboard = await invoke<Dashboard>("dashboard_summary", { root: project.value!.root });
    } catch (err) {
      error = String(err);
    }
  });

  function formatMinutes(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
  }

  const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const HOUR_LABELS = Array.from({ length: 24 }, (_, h) => String(h));
</script>

{#snippet dayChart(buckets: DayBucket[])}
  {@const max = Math.max(1, ...buckets.map((b) => b.value))}
  {@const labelEvery = Math.max(1, Math.ceil(buckets.length / 6))}
  <svg viewBox="0 0 {buckets.length * 10} 120" preserveAspectRatio="none" class="chart">
    {#each buckets as b, i (i)}
      {@const h = (b.value / max) * 110}
      <rect x={i * 10 + 1} y={120 - h} width="8" height={h} class="bar">
        <title>{b.label}: {b.value}</title>
      </rect>
    {/each}
  </svg>
  <div class="day-axis" style="grid-template-columns: repeat({buckets.length}, 1fr);">
    {#each buckets as b, i (i)}
      <span>{i % labelEvery === 0 || i === buckets.length - 1 ? b.label : ""}</span>
    {/each}
  </div>
{/snippet}

{#snippet labeledChart(values: number[], labels: string[])}
  {@const max = Math.max(1, ...values)}
  <svg viewBox="0 0 {values.length * 20} 120" preserveAspectRatio="none" class="chart">
    {#each values as v, i (i)}
      {@const h = (v / max) * 110}
      <rect x={i * 20 + 2} y={120 - h} width="16" height={h} class="bar">
        <title>{labels[i]}: {v}</title>
      </rect>
    {/each}
  </svg>
  <div class="labeled-axis" style="grid-template-columns: repeat({labels.length}, 1fr);">
    {#each labels as l, i (i)}
      <span>{l}</span>
    {/each}
  </div>
{/snippet}

<div class="panel">
  {#if error}<p class="error">{error}</p>{/if}
  {#if dashboard}
    <dl>
      <dt>Sessions</dt>
      <dd>{dashboard.session_count}</dd>
      <dt>Total writing time</dt>
      <dd>{formatMinutes(dashboard.total_minutes)}</dd>
      <dt>Words written across sessions</dt>
      <dd>{dashboard.total_words.toLocaleString()}</dd>
      <dt>Documents created (all time)</dt>
      <dd>{dashboard.documents_created}</dd>
    </dl>

    <h4>Word count, last {dashboard.word_counts.length} days</h4>
    {@render dayChart(dashboard.word_counts)}

    <h4>Sessions, last {dashboard.sessions.length} days</h4>
    {@render dayChart(dashboard.sessions)}

    <h4>Documents created, last {dashboard.documents_created_by_day.length} days</h4>
    {@render dayChart(dashboard.documents_created_by_day)}

    <h4>Documents modified, last {dashboard.documents_modified_by_day.length} days</h4>
    {@render dayChart(dashboard.documents_modified_by_day)}

    <div class="metric-toggle">
      <span>Activity by:</span>
      <button class:active={metric === "words"} onclick={() => (metric = "words")}>Words</button>
      <button class:active={metric === "time"} onclick={() => (metric = "time")}>Time (minutes)</button>
    </div>

    <h4>Activity by day of week</h4>
    {@render labeledChart(
      metric === "words" ? dashboard.weekday_words : dashboard.weekday_minutes,
      WEEKDAY_LABELS,
    )}

    <h4>Activity by hour of day</h4>
    {@render labeledChart(metric === "words" ? dashboard.hour_words : dashboard.hour_minutes, HOUR_LABELS)}
  {/if}
</div>

<style>
  .panel {
    height: 100%;
    overflow: auto;
    padding: 0.5rem 0.75rem 1rem;
    box-sizing: border-box;
  }

  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.4rem 1rem;
    margin: 0 0 0.5rem;
  }

  dt {
    color: var(--color-fg-muted);
    font-size: 0.85rem;
  }

  dd {
    margin: 0;
    font-weight: bold;
  }

  h4 {
    margin: 1rem 0 0.3rem;
    font-size: 0.8rem;
    color: var(--color-fg-muted);
    font-weight: normal;
  }

  .chart {
    display: block;
    width: 100%;
    height: 120px;
  }

  .bar {
    fill: var(--color-accent);
  }

  .day-axis,
  .labeled-axis {
    display: grid;
    font-size: 0.6rem;
    color: var(--color-fg-muted);
    margin-top: 0.15rem;
  }

  .day-axis span,
  .labeled-axis span {
    text-align: center;
    white-space: nowrap;
    overflow: visible;
  }

  .metric-toggle {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 1.2rem;
    font-size: 0.8rem;
  }

  .metric-toggle button {
    font-size: 0.78rem;
    padding: 0.15rem 0.5rem;
  }

  .metric-toggle button.active {
    background: var(--color-accent);
    color: white;
  }

  .error {
    color: var(--color-danger);
  }
</style>
