// Backs the Zoom In/Out/Reset Preview shortcuts — a plain CSS scale on
// PreviewPanel.svelte's own content, not a persisted setting.
export const previewZoom = $state<{ scale: number }>({ scale: 1 });

export function zoomInPreview() {
  previewZoom.scale = Math.min(previewZoom.scale + 0.1, 3);
}

export function zoomOutPreview() {
  previewZoom.scale = Math.max(previewZoom.scale - 0.1, 0.5);
}

export function resetPreviewZoom() {
  previewZoom.scale = 1;
}
