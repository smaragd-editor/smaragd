// One-shot "select this tag" request for TagsPanel.svelte, consumed the
// moment it's read — backs the `:tag <name>` command-prompt command (see
// commandPrompt.ts), which needs to reach into the Tags dock panel from
// outside it, the same way exportRequest/settingsRequest reach into their
// own dialogs.
export const tagsRequest = $state<{ tag: string | null }>({ tag: null });

export function requestTagFilter(tag: string) {
  tagsRequest.tag = tag;
}

export function consumeTagsRequest(): string | null {
  const tag = tagsRequest.tag;
  tagsRequest.tag = null;
  return tag;
}
