//! App-wide preferences for the Tauri shell — the portable counterpart of
//! the real egui app's `Settings` (`app/src/settings.rs`, ~43 fields). Not
//! a byte-for-byte port: persisted to its own `smaragd-tauri.toml` (see
//! `config_file_path`), not the egui app's `smaragd.toml`, so the two apps
//! can coexist on one machine during the migration without either's save
//! ever risking corrupting or silently dropping fields from the other's
//! settings file. Everything here either already has a real effect or is
//! wired alongside this module. Plugin shortcut overrides are the one
//! exception worth calling out: they
//! reuse `shortcuts` below rather than needing a field of their own — see
//! that field's doc comment.
//!
//! `egui`-coupled fields from the original (`theme_preference:
//! egui::ThemePreference`, `editor_font`/`ui_font: EditorFont` holding an
//! egui font handle, shortcuts keyed by `egui::KeyboardShortcut`) are
//! replaced here with plain portable equivalents — see `ThemePreference`,
//! `EditorFont`, and `KeyCombo` below.

use std::collections::BTreeMap;
use std::io;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::project::store::ProjectStore;

/// A keyboard shortcut as plain data — the portable replacement for
/// `egui::KeyboardShortcut`. `key` is a DOM `KeyboardEvent.key` value
/// (lowercased for letters, e.g. `"s"`, `"f2"`, `"arrowleft"`, `","`) rather
/// than egui's own `Key` enum, since the frontend matches it directly
/// against browser keyboard events. `ctrl_or_cmd` collapses egui's
/// platform-abstracted `Modifiers::COMMAND` (Ctrl on Windows/Linux, Cmd on
/// macOS) into one field — which physical key that means is resolved at
/// match time in the frontend, not stored here.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct KeyCombo {
    pub key: String,
    pub ctrl_or_cmd: bool,
    pub shift: bool,
    pub alt: bool,
}

impl KeyCombo {
    pub fn new(key: &str) -> Self {
        Self {
            key: key.to_string(),
            ctrl_or_cmd: false,
            shift: false,
            alt: false,
        }
    }

    pub fn cmd(key: &str) -> Self {
        Self {
            ctrl_or_cmd: true,
            ..Self::new(key)
        }
    }

    pub fn cmd_shift(key: &str) -> Self {
        Self {
            ctrl_or_cmd: true,
            shift: true,
            ..Self::new(key)
        }
    }

    pub fn cmd_alt(key: &str) -> Self {
        Self {
            ctrl_or_cmd: true,
            alt: true,
            ..Self::new(key)
        }
    }

    pub fn cmd_alt_shift(key: &str) -> Self {
        Self {
            ctrl_or_cmd: true,
            alt: true,
            shift: true,
            ..Self::new(key)
        }
    }

    pub fn alt(key: &str) -> Self {
        Self {
            alt: true,
            ..Self::new(key)
        }
    }
}

/// True for a [`KeyCombo::key`] that never corresponds to a typed character
/// (a function key or `Escape`) — safe to bind without requiring a
/// modifier, since doing so can't make any character impossible to type.
/// Portable counterpart of the real egui app's own
/// `shortcuts::is_modifier_free_safe_key`.
fn is_modifier_free_safe_key(key: &str) -> bool {
    key == "escape"
        || key
            .strip_prefix('f')
            .and_then(|rest| rest.parse::<u8>().ok())
            .is_some_and(|n| (1..=35).contains(&n))
}

/// Whether `combo` is safe to bind: it must either require at least one
/// modifier, or use a key from [`is_modifier_free_safe_key`] — otherwise
/// binding it would make some character impossible to type anywhere in the
/// app. Used by `plugins::load` to validate a script's `register_shortcut`
/// call — portable counterpart of the real egui app's own
/// `shortcuts::is_safe_binding`.
pub fn is_safe_binding(combo: &KeyCombo) -> bool {
    combo.ctrl_or_cmd || combo.shift || combo.alt || is_modifier_free_safe_key(&combo.key)
}

/// Portable replacement for `egui::ThemePreference` (same three variants —
/// egui's own enum already has this exact shape, so this isn't a new
/// design, just decoupled from the egui crate).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum ThemePreference {
    #[default]
    System,
    Dark,
    Light,
}

/// Portable replacement for the real app's `editor_font::EditorFont` (same
/// 5 variants) — maps to a CSS font-family on the frontend; the two
/// non-system faces' bytes are already in `crate::fonts` from the Phase 0
/// workspace split, reusable for the Preview/export path exactly as today.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum EditorFont {
    #[default]
    Proportional,
    Monospace,
    LibertinusSerif,
    DejaVuSansMono,
    AtkinsonHyperlegible,
}

impl EditorFont {
    pub const ALL: [EditorFont; 5] = [
        EditorFont::Proportional,
        EditorFont::Monospace,
        EditorFont::LibertinusSerif,
        EditorFont::DejaVuSansMono,
        EditorFont::AtkinsonHyperlegible,
    ];

    pub fn label(self) -> &'static str {
        match self {
            EditorFont::Proportional => "Proportional (system default)",
            EditorFont::Monospace => "Monospace (system default)",
            EditorFont::LibertinusSerif => "Libertinus Serif",
            EditorFont::DejaVuSansMono => "DejaVu Sans Mono",
            EditorFont::AtkinsonHyperlegible => "Atkinson Hyperlegible",
        }
    }
}

/// A string that must never appear in logs or `{:?}` output — the sync
/// passphrase field's type, shape-compatible with the real app's own
/// `SecretString`.
#[derive(Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct SecretString(pub String);

impl std::fmt::Debug for SecretString {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(if self.0.is_empty() {
            "SecretString(<unset>)"
        } else {
            "SecretString(<redacted>)"
        })
    }
}

const MAX_RECENT_PROJECTS: usize = 10;
const DEFAULT_BACKUP_KEEP_COUNT: u32 = 10;
const DEFAULT_UI_SCALE: f32 = 1.0;
const DEFAULT_GIT_COMMIT_MESSAGE_TEMPLATE: &str = "Smaragd backup\n\n{{fileList}}";

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub reopen_last_project: bool,
    pub last_project_path: Option<PathBuf>,
    pub recent_project_paths: Vec<PathBuf>,
    pub create_starter_folders: bool,

    /// Keyed by the same stable snake_case action ids the real app's
    /// `ShortcutAction::id()` uses (see frontend/src/shortcuts.ts, the
    /// single source of truth for the action catalog on this side of the
    /// port) — an id absent from this map is unbound. Also doubles as the
    /// override map for a loaded plugin's `register_shortcut` default, keyed
    /// by that plugin command's own name instead of a built-in action id —
    /// the two id spaces don't collide (plugin command names are validated
    /// against the project's own namespace, not this catalog), so one map
    /// covers both rather than needing a second `plugin_shortcut_overrides`
    /// field the way the egui app's `Settings` has.
    pub shortcuts: BTreeMap<String, KeyCombo>,

    pub theme_preference: ThemePreference,
    pub color_theme: Option<String>,

    pub template_date_format: String,
    pub template_time_format: String,

    pub editor_font: EditorFont,
    pub editor_font_size: f32,
    pub ui_font: EditorFont,

    pub git_integration_disabled: bool,
    /// `None` means "not yet configured" — resolved to
    /// `DEFAULT_GIT_COMMIT_MESSAGE_TEMPLATE` by `resolve_git_commit_message_template`.
    /// Added after this struct's initial port, once a real git-commit menu
    /// action actually needed it.
    pub git_commit_message_template: Option<String>,

    pub backup_enabled: bool,
    pub backup_on_open: bool,
    pub backup_on_close: bool,
    pub backup_on_manual_save: bool,
    pub backup_keep_count: u32,
    pub backup_dir: Option<PathBuf>,

    /// Master switch for background sync through a self-hosted sync server
    /// (see `smaragd_core::sync` and the manual's Sync chapter), set via
    /// Settings > Sync. A project only syncs when this is on *and* it has
    /// been paired with a vault (see `core::sync::link::ProjectLink`).
    pub sync_enabled: bool,
    /// The sync server's host name (no scheme, no path). Blank means "not
    /// configured". Used when *creating or joining* a vault; a paired
    /// project then remembers the server it was paired with.
    pub sync_server_host: String,
    /// The sync server's port. `0` means "not yet configured," resolved by
    /// `resolve_sync_server_port` (443 with TLS, 8080 without) — same
    /// blank-means-unset convention as `backup_keep_count`.
    pub sync_server_port: u16,
    /// Connect over plain HTTP instead of HTTPS. Stored inverted, like
    /// `git_integration_disabled`, because every `bool` field here defaults
    /// to `false` and the safe default is TLS *on* — see `sync_use_tls`.
    pub sync_plain_http: bool,
    /// Path prefix when the server sits behind a reverse proxy at a
    /// sub-path (e.g. `smaragd` for `https://example.com/smaragd/`).
    /// Usually blank.
    pub sync_server_path: String,
    /// The end-to-end encryption passphrase, identical on every device that
    /// syncs. The server never sees it; a key is derived from it in memory
    /// (Argon2id) and never written to disk. Stored in the clear in
    /// `smaragd-tauri.toml` like every other setting (there is no OS-keyring
    /// integration yet), which is kept owner-only (see `save_to_path`'s
    /// `write_private`). It cannot be recovered if lost.
    pub sync_passphrase: SecretString,
    /// How this device shows up in the vault's device list. Blank resolves
    /// to "Smaragd on <OS>" (`resolve_sync_device_name`).
    pub sync_device_name: String,

    pub pomodoro_work_minutes: u32,
    pub pomodoro_short_break_minutes: u32,
    pub pomodoro_long_break_minutes: u32,
    pub pomodoro_cycles_before_long_break: u32,
    /// Unlike every other `bool` field here, this one's real default is
    /// `true` (matching the egui app's own `Settings::default()`) — a
    /// phase-complete notification is the whole point of running a
    /// Pomodoro timer, so it needs an explicit opt-out rather than an
    /// opt-in. A plain `bool` can't carry its own "unset" sentinel the way
    /// the `0`-means-unset numeric fields above do, so this is resolved via
    /// `default_true` both for a missing key in an on-disk settings file
    /// and for `Settings::default()` itself — see that impl below.
    #[serde(default = "default_true")]
    pub pomodoro_notifications_enabled: bool,

    pub typewriter_quotes: bool,
    pub show_editor_gutter: bool,
    pub multi_tab_editor: bool,

    pub ui_scale: f32,
    pub double_shift_search_disabled: bool,

    /// Show each document's `lines/words/chars` (see `frontmatter::
    /// count_lines`/`count_words`/`count_chars`) next to its Binder row —
    /// the Tauri port's counterpart of the real app's own identically-named
    /// field (`app/src/settings.rs`), added once the Binder actually had a
    /// row to show it on.
    pub show_document_stats_in_binder: bool,

    /// Which dictionary (if any) flags misspelled words in the Editor — see
    /// `crate::spellcheck`. Unlike the real app, this is the *only* place the
    /// active language lives in this port (no per-project remembered
    /// language on toggle-off — see shortcuts.ts's `toggle_spell_check`
    /// handler for that simplification).
    pub spell_check_language: crate::spellcheck::SpellCheckLanguage,

    /// Hides DockLayout.svelte's "Window:" row (one button per panel,
    /// open/close-toggling it) — a Tauri-port-only convenience with no
    /// real-app counterpart (the real app's own panel list lives in the
    /// Window *menu*, not an always-visible bar), so there's no existing
    /// field name to mirror. `false` (the default) keeps today's behavior
    /// — named so an absent/old settings file doesn't silently hide it for
    /// existing users, same "default-false-means-unchanged" convention
    /// `git_integration_disabled`/`double_shift_search_disabled` already use.
    pub hide_window_button_bar: bool,
}

/// `~/.config/smaragd-tauri/smaragd-tauri.toml` on Linux, the platform
/// equivalent elsewhere — deliberately a different `directories`
/// qualifier/app name than the real app's `smaragd`, not just a different
/// filename inside the same dir, so the two never share a config directory
/// at all. See the module doc for why.
pub fn config_file_path() -> Option<PathBuf> {
    directories::ProjectDirs::from("", "", "smaragd-tauri")
        .map(|dirs| dirs.config_dir().join("smaragd-tauri.toml"))
}

impl Settings {
    /// Both branches go through `toml::from_str`, not the plain derived
    /// `Settings::default()` (which — being `#[derive(Default)]` — gives
    /// every `bool` field `false`), so a missing/unreadable settings file
    /// resolves each field the exact same way a *present* file missing
    /// that one key would: via the struct-level `#[serde(default)]`
    /// fallback, or a field's own override like
    /// `pomodoro_notifications_enabled`'s `default_true`. (`Settings::
    /// default()` itself can't be implemented this way — serde's own
    /// container-level `#[serde(default)]` codegen calls `Default::
    /// default()` to source whichever fields *don't* have their own
    /// field-level override, so routing `Default::default()` through
    /// `toml::from_str` here would recurse infinitely; confirmed by a
    /// stack overflow when first tried.)
    pub fn load_from_path(store: &dyn ProjectStore, path: &std::path::Path) -> Self {
        let Ok(contents) = store.read_to_string(path) else {
            return toml::from_str("").unwrap_or_default();
        };
        toml::from_str(&contents).unwrap_or_default()
    }

    pub fn save_to_path(&self, store: &dyn ProjectStore, path: &std::path::Path) -> io::Result<()> {
        if let Some(parent) = path.parent() {
            store.create_dir_all(parent)?;
        }
        let contents = toml::to_string_pretty(self)
            .map_err(|err| io::Error::new(io::ErrorKind::InvalidData, err))?;
        store.write_private(path, contents.as_bytes())
    }

    /// Records `root` as the most recently opened project, most-recent-first,
    /// capped at `MAX_RECENT_PROJECTS` and de-duplicated (re-opening an
    /// already-recent project just moves it to the front rather than
    /// appearing twice).
    pub fn record_recent_project(&mut self, root: PathBuf) {
        self.last_project_path = Some(root.clone());
        self.recent_project_paths.retain(|p| p != &root);
        self.recent_project_paths.insert(0, root);
        self.recent_project_paths.truncate(MAX_RECENT_PROJECTS);
    }

    pub fn resolve_backup_keep_count(&self) -> u32 {
        if self.backup_keep_count == 0 {
            DEFAULT_BACKUP_KEEP_COUNT
        } else {
            self.backup_keep_count
        }
    }

    pub fn resolve_backup_dir(&self) -> Option<PathBuf> {
        self.backup_dir
            .clone()
            .or_else(crate::backup::default_backup_dir)
    }

    pub fn resolve_ui_scale(&self) -> f32 {
        if self.ui_scale <= 0.0 {
            DEFAULT_UI_SCALE
        } else {
            self.ui_scale
        }
    }

    pub fn resolve_git_commit_message_template(&self) -> String {
        self.git_commit_message_template
            .clone()
            .unwrap_or_else(|| DEFAULT_GIT_COMMIT_MESSAGE_TEMPLATE.to_string())
    }

    pub fn sync_use_tls(&self) -> bool {
        !self.sync_plain_http
    }

    /// Resolve `sync_server_port`'s blank-means-unset (`0`) convention.
    pub fn resolve_sync_server_port(&self) -> u16 {
        match (self.sync_server_port, self.sync_use_tls()) {
            (0, true) => 443,
            (0, false) => 8080,
            (port, _) => port,
        }
    }

    /// Resolve `sync_device_name`'s blank-means-unset convention.
    pub fn resolve_sync_device_name(&self) -> String {
        let name = self.sync_device_name.trim();
        if name.is_empty() {
            format!("Smaragd on {}", std::env::consts::OS)
        } else {
            name.to_string()
        }
    }

    /// Why sync can't be used with the current settings, in words for the
    /// user, or `None` if the server and passphrase are both filled in
    /// sensibly.
    pub fn sync_config_problem(&self) -> Option<&'static str> {
        let host = self.sync_server_host.trim();
        if host.is_empty() {
            return Some("Enter the sync server's host name in Settings > Sync.");
        }
        if !smaragd_sync_protocol::ticket::ServerAddr::is_plain_host(host) {
            return Some(
                "The sync server's host should be just a name like sync.example.com \
                 (no http://, no path) — use the Path field for a sub-path.",
            );
        }
        if !smaragd_sync_protocol::ticket::ServerAddr::is_plain_path(self.sync_server_path.trim())
        {
            return Some(
                "The sync server's path should be a plain prefix like smaragd \
                 (letters, digits, -, _ and . only).",
            );
        }
        if self.sync_passphrase.0.is_empty() {
            return Some("Enter your encryption passphrase in Settings > Sync.");
        }
        None
    }

    pub fn sync_server_addr(&self) -> Option<smaragd_sync_protocol::ticket::ServerAddr> {
        let host = self.sync_server_host.trim();
        (!host.is_empty()).then(|| smaragd_sync_protocol::ticket::ServerAddr {
            host: host.to_string(),
            port: self.resolve_sync_server_port(),
            use_tls: self.sync_use_tls(),
            path: self.sync_server_path.trim().trim_matches('/').to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::store::NativeStore;

    #[test]
    fn round_trips_through_toml() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("smaragd-tauri.toml");
        let store = NativeStore;

        let mut settings = Settings::default();
        settings.shortcuts.insert("save".into(), KeyCombo::cmd("s"));
        settings.record_recent_project(dir.path().join("project-a"));
        settings.record_recent_project(dir.path().join("project-b"));
        settings.sync_enabled = true;
        settings.sync_server_host = "sync.example.com".into();
        settings.sync_server_port = 8443;
        settings.sync_plain_http = true;
        settings.sync_server_path = "smaragd".into();
        settings.sync_passphrase = SecretString("correct horse battery staple".into());
        settings.sync_device_name = "Test Device".into();

        settings.save_to_path(&store, &path).unwrap();
        let loaded = Settings::load_from_path(&store, &path);

        assert_eq!(loaded, settings);
    }

    #[test]
    fn missing_file_falls_back_to_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("does-not-exist.toml");
        let store = NativeStore;

        // Not quite `Settings::default()` (the plain `#[derive(Default)]`
        // value): `pomodoro_notifications_enabled`'s real default is
        // `true`, which only a field-level `#[serde(default = "...")]`
        // can express, and that only applies through actual
        // deserialization — see `load_from_path`'s own doc comment for
        // why `Default::default()` can't be implemented the same way.
        assert_eq!(
            Settings::load_from_path(&store, &path),
            Settings {
                pomodoro_notifications_enabled: true,
                ..Settings::default()
            }
        );
    }

    #[test]
    fn an_existing_settings_file_missing_the_notifications_key_defaults_it_to_true() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("smaragd-tauri.toml");
        let store = NativeStore;
        // Simulates upgrading from a settings.toml saved before this field
        // existed — present file, absent key, as opposed to
        // `missing_file_falls_back_to_defaults`'s absent-file case.
        store.write(&path, b"reopen_last_project = true\n").unwrap();

        let loaded = Settings::load_from_path(&store, &path);

        assert!(loaded.reopen_last_project);
        assert!(loaded.pomodoro_notifications_enabled);
    }

    #[test]
    fn record_recent_project_dedupes_and_caps() {
        let mut settings = Settings::default();
        for i in 0..15 {
            settings.record_recent_project(PathBuf::from(format!("/p{i}")));
        }
        assert_eq!(settings.recent_project_paths.len(), MAX_RECENT_PROJECTS);
        assert_eq!(settings.recent_project_paths[0], PathBuf::from("/p14"));

        settings.record_recent_project(PathBuf::from("/p10"));
        assert_eq!(settings.recent_project_paths[0], PathBuf::from("/p10"));
        assert_eq!(
            settings
                .recent_project_paths
                .iter()
                .filter(|p| p.as_path() == std::path::Path::new("/p10"))
                .count(),
            1
        );
    }

    #[test]
    fn resolve_methods_apply_blank_means_unset_convention() {
        let settings = Settings::default();
        assert_eq!(
            settings.resolve_backup_keep_count(),
            DEFAULT_BACKUP_KEEP_COUNT
        );
        assert_eq!(settings.resolve_ui_scale(), DEFAULT_UI_SCALE);
    }

    #[test]
    fn resolve_sync_server_port_defaults_by_tls() {
        let mut settings = Settings::default();
        assert_eq!(settings.resolve_sync_server_port(), 443);
        settings.sync_plain_http = true;
        assert_eq!(settings.resolve_sync_server_port(), 8080);
        settings.sync_server_port = 9000;
        assert_eq!(settings.resolve_sync_server_port(), 9000);
    }

    #[test]
    fn resolve_sync_device_name_falls_back_to_os_label() {
        let settings = Settings::default();
        assert_eq!(
            settings.resolve_sync_device_name(),
            format!("Smaragd on {}", std::env::consts::OS)
        );
        let named = Settings {
            sync_device_name: "My Laptop".into(),
            ..Settings::default()
        };
        assert_eq!(named.resolve_sync_device_name(), "My Laptop");
    }

    #[test]
    fn sync_config_problems_are_explained_in_order() {
        let mut settings = Settings::default();
        assert!(settings.sync_config_problem().unwrap().contains("host name"));

        settings.sync_server_host = "https://sync.example.com/x".into();
        assert!(settings.sync_config_problem().unwrap().contains("just a name"));

        settings.sync_server_host = "sync.example.com".into();
        settings.sync_server_path = "/bad path/".into();
        assert!(settings.sync_config_problem().unwrap().contains("plain prefix"));

        settings.sync_server_path = "smaragd".into();
        assert!(settings.sync_config_problem().unwrap().contains("passphrase"));

        settings.sync_passphrase = SecretString("a real passphrase".into());
        assert_eq!(settings.sync_config_problem(), None);
    }

    #[test]
    fn sync_server_addr_is_none_until_a_host_is_set() {
        let mut settings = Settings::default();
        assert!(settings.sync_server_addr().is_none());

        settings.sync_server_host = " sync.example.com ".into();
        settings.sync_server_path = "/smaragd/".into();
        let addr = settings.sync_server_addr().unwrap();
        assert_eq!(addr.host, "sync.example.com");
        assert_eq!(addr.path, "smaragd");
        assert_eq!(addr.port, 443);
        assert!(addr.use_tls);
    }
}
