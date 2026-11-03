// Lets anything (MenuBar's own Settings/Project Settings items, Search
// Everywhere's Settings tab) open a settings dialog pre-focused to a
// specific category — same shared-request-store shape as exportRequest.
// `category` is untyped (string) rather than SettingsDialog's own Category
// union, since that union is local to SettingsDialog.svelte and this store
// has no reason to import a dialog component's internal type; each dialog
// validates it against its own category list before using it.
export const settingsRequest = $state<{ open: boolean; category: string | null }>({
  open: false,
  category: null,
});

export function requestSettings(category: string | null = null) {
  settingsRequest.open = true;
  settingsRequest.category = category;
}

export function closeSettingsRequest() {
  settingsRequest.open = false;
  settingsRequest.category = null;
}

export const projectSettingsRequest = $state<{ open: boolean; category: string | null }>({
  open: false,
  category: null,
});

export function requestProjectSettings(category: string | null = null) {
  projectSettingsRequest.open = true;
  projectSettingsRequest.category = category;
}

export function closeProjectSettingsRequest() {
  projectSettingsRequest.open = false;
  projectSettingsRequest.category = null;
}
