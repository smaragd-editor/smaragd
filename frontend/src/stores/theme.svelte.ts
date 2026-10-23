import { settingsStore, saveSettingsDebounced } from "./settings.svelte";

// Applies settingsStore's theme_preference/color_theme to the page, as CSS
// custom properties on :root — the approach core::color_theme.rs's own doc
// comment calls for (a ColorTheme is just 4 portable hex colors, not an
// egui::Visuals). Called explicitly after every mutation that can change
// either field, same "no reactive module-scope $effect" convention the rest
// of this app's stores already use (see saveSettingsDebounced's callers).
export function applyTheme() {
  const root = document.documentElement;
  const { theme_preference, color_theme } = settingsStore.value;
  const theme = color_theme
    ? settingsStore.colorThemes.find((t) => t.id === color_theme)
    : undefined;

  if (theme) {
    root.setAttribute("data-theme", theme.dark ? "dark" : "light");
    root.style.setProperty("--color-bg", theme.background);
    root.style.setProperty("--color-fg", theme.foreground);
    root.style.setProperty("--color-accent", theme.accent);
    root.style.setProperty("--color-broken-wikilink", theme.broken_wikilink);
  } else {
    root.style.removeProperty("--color-bg");
    root.style.removeProperty("--color-fg");
    root.style.removeProperty("--color-accent");
    root.style.removeProperty("--color-broken-wikilink");
    if (theme_preference === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme_preference);
  }
}

function resolvedIsDark(): boolean {
  const { theme_preference, color_theme } = settingsStore.value;
  const theme = color_theme
    ? settingsStore.colorThemes.find((t) => t.id === color_theme)
    : undefined;
  if (theme) return theme.dark;
  if (theme_preference === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  return theme_preference === "dark";
}

/** Backs the Toggle Dark/Light Mode shortcut — a plain binary flip, so it
 * clears any named `color_theme` (which would otherwise keep pinning one
 * side) and sets `theme_preference` to the opposite of whatever is
 * currently resolving on screen. */
export function toggleDarkMode() {
  settingsStore.value.theme_preference = resolvedIsDark() ? "light" : "dark";
  settingsStore.value.color_theme = null;
  settingsStore.value = { ...settingsStore.value };
  saveSettingsDebounced();
  applyTheme();
}
