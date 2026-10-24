// Which form the Metadata dock panel shows — matches the real app's own
// `app::MetadataTarget` (app/src/app/refresh.rs): the open document's own
// frontmatter (the default), a specific folder's metadata (BinderTree's own
// folder-row click), or the project-wide fields (BinderTree's root-row
// click). Independent of `project.selectedPath` — selecting a folder/the
// project for metadata doesn't open or close any document, same as the
// real app's `BinderEvent::SelectFolder`/`SelectProject` leaving
// `self.editor` untouched.
export type MetadataSelection = { kind: "document" } | { kind: "folder"; path: string } | { kind: "project" };

export const metadataSelection = $state<{ value: MetadataSelection }>({ value: { kind: "document" } });

export function selectFolderMetadata(path: string) {
  metadataSelection.value = { kind: "folder", path };
}

export function selectProjectMetadata() {
  metadataSelection.value = { kind: "project" };
}

// Called whenever a document is opened/switched to — mirrors the real
// app's `after_document_switch`, which resets `metadata.target` to
// `Document` on every tab switch.
export function resetMetadataSelectionToDocument() {
  metadataSelection.value = { kind: "document" };
}
