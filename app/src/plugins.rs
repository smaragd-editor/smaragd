//! Thin egui-side wrapper over the portable plugin engine in
//! [`smaragd_core::plugins`] — see that module for the real implementation
//! (loading `.rhai` scripts, host functions, `:` command dispatch, the
//! `on_save` hook). This module's only job is converting
//! `smaragd_core::settings::KeyCombo` to `egui::KeyboardShortcut` at the one
//! remaining egui-specific boundary (a plugin's `register_shortcut` default),
//! so the rest of the app crate (`app.rs`'s `compute_effective_plugin_shortcuts`,
//! `run_plugin_command`, etc.) keeps using `egui::KeyboardShortcut` throughout,
//! unchanged by the move.

use egui::{Key, KeyboardShortcut, Modifiers};
use smaragd_core::settings::KeyCombo;
use std::path::Path;

pub use smaragd_core::plugins::{PluginEffects, global_plugins_dir};

/// Wraps [`smaragd_core::plugins::PluginEngine`], re-exposing every method
/// app code calls with the same signatures it already had before this engine
/// moved to `core` — only `shortcut_defaults` actually does any conversion
/// work; the rest delegate straight through.
#[derive(Default)]
pub struct PluginEngine(smaragd_core::plugins::PluginEngine);

impl PluginEngine {
    /// Every loaded plugin command's default keyboard shortcut, converted to
    /// `egui::KeyboardShortcut` — a default whose key name doesn't map to a
    /// known `egui::Key` (shouldn't happen: `core::plugins::parse_shortcut_spec`
    /// only ever produces key names `egui_key_from_combo_key` below
    /// recognizes) is silently dropped rather than panicking, same
    /// fail-soft stance the rest of plugin loading takes.
    pub fn shortcut_defaults(&self) -> impl Iterator<Item = (&str, KeyboardShortcut)> {
        self.0
            .shortcut_defaults()
            .filter_map(|(name, combo)| key_combo_to_egui_shortcut(&combo).map(|s| (name, s)))
    }

    pub fn command_names(&self) -> impl Iterator<Item = &str> {
        self.0.command_names()
    }

    pub fn run_command(
        &self,
        name: &str,
        arg: &str,
        document_text: Option<&str>,
        document_basename: Option<&str>,
        document_filename: Option<&str>,
    ) -> (PluginEffects, Result<(), String>) {
        self.0.run_command(
            name,
            arg,
            document_text,
            document_basename,
            document_filename,
        )
    }

    pub fn run_on_save(&self, text: &str) -> (String, Vec<String>) {
        self.0.run_on_save(text)
    }
}

/// [`smaragd_core::plugins::load`], wrapped the same way [`PluginEngine`] is.
pub fn load(dirs: &[&Path], working_dir: Option<&Path>) -> (PluginEngine, Vec<String>) {
    let (engine, errors) = smaragd_core::plugins::load(dirs, working_dir);
    (PluginEngine(engine), errors)
}

/// Converts a `KeyCombo::key` string (the portable, DOM-ish vocabulary
/// `core::plugins::parse_shortcut_spec` produces) to an `egui::Key`. A
/// single alphanumeric character or one of the bare punctuation marks that
/// vocabulary allows (`;`, `,`, `.`) already matches `egui::Key::from_name`
/// directly; the handful of named keys need their egui spelling instead.
fn egui_key_from_combo_key(key: &str) -> Option<Key> {
    if key.chars().count() == 1 {
        return Key::from_name(key);
    }
    match key {
        "escape" => Some(Key::Escape),
        "enter" => Some(Key::Enter),
        "backspace" => Some(Key::Backspace),
        "tab" => Some(Key::Tab),
        "arrowleft" => Some(Key::ArrowLeft),
        "arrowright" => Some(Key::ArrowRight),
        "arrowup" => Some(Key::ArrowUp),
        "arrowdown" => Some(Key::ArrowDown),
        "equal" => Some(Key::Equals),
        "minus" => Some(Key::Minus),
        _ => key
            .strip_prefix('f')
            .and_then(|rest| rest.parse::<u8>().ok())
            .filter(|n| (1..=35).contains(n))
            .and_then(|n| Key::from_name(&format!("F{n}"))),
    }
}

fn key_combo_to_egui_shortcut(combo: &KeyCombo) -> Option<KeyboardShortcut> {
    let key = egui_key_from_combo_key(&combo.key)?;
    let mut modifiers = Modifiers::NONE;
    if combo.ctrl_or_cmd {
        modifiers |= Modifiers::COMMAND;
    }
    if combo.shift {
        modifiers |= Modifiers::SHIFT;
    }
    if combo.alt {
        modifiers |= Modifiers::ALT;
    }
    Some(KeyboardShortcut::new(modifiers, key))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn egui_key_from_combo_key_covers_letters_digits_and_named_keys() {
        assert_eq!(egui_key_from_combo_key("k"), Some(Key::K));
        assert_eq!(egui_key_from_combo_key("7"), Some(Key::Num7));
        assert_eq!(egui_key_from_combo_key("escape"), Some(Key::Escape));
        assert_eq!(egui_key_from_combo_key("enter"), Some(Key::Enter));
        assert_eq!(egui_key_from_combo_key("arrowleft"), Some(Key::ArrowLeft));
        assert_eq!(egui_key_from_combo_key("f2"), Some(Key::F2));
        assert_eq!(egui_key_from_combo_key("f35"), Some(Key::F35));
        assert_eq!(egui_key_from_combo_key(";"), Some(Key::Semicolon));
        assert_eq!(egui_key_from_combo_key("not_a_key"), None);
        assert_eq!(egui_key_from_combo_key("f36"), None);
    }

    #[test]
    fn key_combo_to_egui_shortcut_carries_modifiers_through() {
        let combo = KeyCombo::cmd_shift("w");
        let shortcut = key_combo_to_egui_shortcut(&combo).unwrap();
        assert_eq!(shortcut.logical_key, Key::W);
        assert_eq!(shortcut.modifiers, Modifiers::COMMAND | Modifiers::SHIFT);
    }

    #[test]
    fn a_plugin_loaded_through_the_shim_runs_its_command_and_default_shortcut() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("wordcount.rhai"),
            r#"
                fn run(arg) { smaragd_status("ran"); }
                register_command("wordcount", "run");
                register_shortcut("wordcount", "ctrl+shift+w");
            "#,
        )
        .unwrap();

        let (engine, errors) = load(&[dir.path()], None);
        assert!(errors.is_empty(), "unexpected load errors: {errors:?}");
        assert_eq!(
            engine.command_names().collect::<Vec<_>>(),
            vec!["wordcount"]
        );
        assert_eq!(
            engine.shortcut_defaults().collect::<Vec<_>>(),
            vec![(
                "wordcount",
                KeyboardShortcut::new(Modifiers::COMMAND | Modifiers::SHIFT, Key::W)
            )]
        );

        let (effects, result) = engine.run_command("wordcount", "", None, None, None);
        assert!(result.is_ok());
        assert_eq!(effects.status_message.as_deref(), Some("ran"));
    }
}
