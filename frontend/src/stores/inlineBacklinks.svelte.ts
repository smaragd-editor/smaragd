// Backs the Toggle Backlinks in Document shortcut — shows the current
// document's backlinks (same `backlinks_for` command BacklinksPanel.svelte
// uses) inline under EditorPanel.svelte instead of only in that separate tab.
export const inlineBacklinks = $state<{ visible: boolean }>({ visible: false });

export function toggleInlineBacklinks() {
  inlineBacklinks.visible = !inlineBacklinks.visible;
}
