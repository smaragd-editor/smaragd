// Same "shared module state across components with no direct parent/child
// relationship" pattern dockLayoutRegistry.svelte.ts uses — lets the global
// Refresh Word Count shortcut call back into whichever WordCountPanel.svelte
// instance is currently mounted, without routing through dock/props.
type WordCountApi = { refresh: () => void };

export const wordCountRegistry = $state<{ api: WordCountApi | null }>({ api: null });

export function registerWordCount(api: WordCountApi) {
  wordCountRegistry.api = api;
}

export function unregisterWordCount() {
  wordCountRegistry.api = null;
}
