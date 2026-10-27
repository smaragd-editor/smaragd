// Mirrors the real app's autocomplete::filter_candidates exactly: prefix
// matches first (alphabetical), then substring matches (alphabetical) —
// shared by the wikilink/#tag autocomplete popups' Tauri-port equivalents
// (MetadataPanel.svelte's tag suggestions, CommandPrompt.svelte's command/
// argument completion).
export function filterCandidates(candidates: string[], query: string): string[] {
  const q = query.toLowerCase();
  const startsWith: string[] = [];
  const contains: string[] = [];
  for (const c of candidates) {
    const lower = c.toLowerCase();
    if (lower.startsWith(q)) startsWith.push(c);
    else if (lower.includes(q)) contains.push(c);
  }
  startsWith.sort();
  contains.sort();
  return [...startsWith, ...contains];
}
