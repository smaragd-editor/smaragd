import { dockLayoutRegistry } from "./dockLayoutRegistry.svelte";
import { project } from "./project.svelte";
import { showToast } from "./toast.svelte";

// Backs the Toggle Focus Mode shortcut — App.svelte hides the menu bar
// while this is active, and DockLayout.svelte's enterFocusMode/exitFocusMode
// (registered on dockLayoutRegistry) clear the dock down to just the Editor.
export const focusMode = $state<{ active: boolean }>({ active: false });

export function toggleFocusMode() {
  if (!focusMode.active && !project.selectedPath) {
    showToast("Open a document first");
    return;
  }
  if (focusMode.active) {
    dockLayoutRegistry.api?.exitFocusMode();
  } else {
    dockLayoutRegistry.api?.enterFocusMode();
  }
  focusMode.active = !focusMode.active;
}
