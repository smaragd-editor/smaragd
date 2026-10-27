// Lets the Add Note at Cursor shortcut (MarkdownEditor.svelte's CodeMirror
// keymap) open NotePromptDialog.svelte pre-targeted at the cursor's
// position — same "global request store rendered once in MenuBar.svelte"
// pattern exportRequest.svelte.ts/GitCommitDialog's showGitCommit use,
// needed here because the trigger (a keypress inside the editor) and the
// render site (MenuBar.svelte, always mounted) are different components.
export const noteRequest = $state<{
  open: boolean;
  path: string | null;
  line: number;
  column: number;
}>({
  open: false,
  path: null,
  line: 0,
  column: 0,
});

export function requestNoteAtCursor(path: string, line: number, column: number) {
  noteRequest.open = true;
  noteRequest.path = path;
  noteRequest.line = line;
  noteRequest.column = column;
}

export function closeNoteRequest() {
  noteRequest.open = false;
  noteRequest.path = null;
}
