//! App-wide preferences, stored separately from the real egui app's own
//! settings file — see core::settings's module doc for why. Stateless like
//! every other command module so far (reload from disk, mutate, save) since
//! settings changes are rare enough that the IPC round trip is irrelevant.

use smaragd_core::color_theme::{ColorTheme, built_in_themes};
use smaragd_core::project::store::NativeStore;
use smaragd_core::settings::Settings;

pub(crate) fn path() -> Result<std::path::PathBuf, String> {
    smaragd_core::settings::config_file_path()
        .ok_or_else(|| "couldn't resolve the platform config directory".to_string())
}

#[tauri::command]
pub fn settings_load() -> Result<Settings, String> {
    Ok(Settings::load_from_path(&NativeStore, &path()?))
}

#[tauri::command]
pub fn settings_save(settings: Settings) -> Result<(), String> {
    settings
        .save_to_path(&NativeStore, &path()?)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn color_themes_list() -> Vec<ColorTheme> {
    built_in_themes()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn color_themes_list_is_never_empty() {
        assert!(!color_themes_list().is_empty());
    }

    // `settings_load`/`settings_save` themselves aren't exercised here: both
    // go through `path()`, which resolves the real platform config
    // directory — calling them from a test would read (or, worse, write)
    // whatever `smaragd-tauri.toml` already exists on the machine running
    // `cargo test`. The round trip they delegate to is covered here instead,
    // against a throwaway path.
    #[test]
    fn settings_load_from_path_and_save_to_path_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("smaragd-tauri.toml");

        let settings = Settings {
            sync_enabled: true,
            sync_server_host: "sync.example.com".to_string(),
            ..Default::default()
        };
        settings.save_to_path(&NativeStore, &path).unwrap();

        let loaded = Settings::load_from_path(&NativeStore, &path);
        assert_eq!(loaded, settings);
    }

    #[test]
    fn settings_load_from_path_resolves_a_missing_file_via_serde_defaults_not_derived_default() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("does-not-exist.toml");

        let loaded = Settings::load_from_path(&NativeStore, &path);

        // Per `Settings::load_from_path`'s own doc comment: a missing file
        // resolves through `toml::from_str`'s field-level `#[serde(default =
        // ...)]` overrides, not the plain `#[derive(Default)]` impl — so a
        // field like `pomodoro_notifications_enabled` (default `true`) comes
        // back `true` here even though `Settings::default()` would give
        // every bool `false`.
        assert!(loaded.pomodoro_notifications_enabled);
        assert!(!Settings::default().pomodoro_notifications_enabled);
        assert!(!loaded.sync_enabled);
    }
}
