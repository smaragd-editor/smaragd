// Lets BinderTree.svelte's context menu "Export…" item open the same
// ExportDialog MenuBar's File > Export Manuscript… does, pre-filled with
// the right-clicked folder — matching the real app's `BinderEvent::Export`,
// which just opens its export panel with `source: path` already set.
export const exportRequest = $state<{ open: boolean; folder: string | null }>({
  open: false,
  folder: null,
});

export function requestExport(folder: string | null = null) {
  exportRequest.open = true;
  exportRequest.folder = folder;
}

export function closeExportRequest() {
  exportRequest.open = false;
  exportRequest.folder = null;
}
