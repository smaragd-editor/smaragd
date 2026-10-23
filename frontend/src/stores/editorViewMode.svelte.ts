// Backs the Toggle Source/Reading View shortcut — switches EditorPanel.svelte
// between the CodeMirror editor and the already-computed `project.previewHtml`
// (stores/project.svelte.ts), rather than needing the separate Preview dock tab.
export const editorViewMode = $state<{ mode: "source" | "reading" }>({ mode: "source" });

export function toggleEditorViewMode() {
  editorViewMode.mode = editorViewMode.mode === "source" ? "reading" : "source";
}
