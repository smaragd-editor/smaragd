//! Wraps `core::spellcheck` — already fully portable (pure Rust, no egui
//! dependency) and already has everything the Editor's underline rendering
//! needs (`misspelled_word_spans`, `is_misspelled`, the dictionary catalog
//! and its downloader); none of it had a Tauri command yet.

use serde::Serialize;
use smaragd_core::spellcheck::{self, SpellCheckLanguage};

#[derive(Serialize)]
pub struct SpellCheckLanguageDto {
    language: SpellCheckLanguage,
    label: String,
    downloaded: bool,
}

/// Every language this build knows about (including `Off`), with whether
/// its dictionary is already downloaded — backs the Settings dialog's
/// Spell Check tab.
#[tauri::command]
pub fn spell_check_catalog() -> Vec<SpellCheckLanguageDto> {
    SpellCheckLanguage::ALL
        .iter()
        .map(|&language| SpellCheckLanguageDto {
            language,
            label: language.label().to_string(),
            downloaded: spellcheck::is_downloaded(language),
        })
        .collect()
}

/// Downloads `language`'s dictionary — real network I/O, but Tauri already
/// runs a plain (non-`async`) command like this off the main/event-loop
/// thread, so this doesn't need its own background-thread plumbing the way
/// the real egui app's `app::dictionary_download` does.
#[tauri::command]
pub fn spell_check_download(language: SpellCheckLanguage) -> Result<(), String> {
    spellcheck::download_dictionary(language)?;
    spellcheck::invalidate_dictionary_cache(language);
    Ok(())
}

/// Byte ranges (as `[start, end]`) of every misspelled word in `text` under
/// `language` — `[]` for `Off` or a language with no dictionary loaded yet.
/// Byte offsets, not UTF-16 code-unit offsets: the frontend converts before
/// handing them to CodeMirror (see `stores/project.svelte.ts`).
#[tauri::command]
pub fn spell_check_misspellings(text: String, language: SpellCheckLanguage) -> Vec<[usize; 2]> {
    spellcheck::misspelled_word_spans(&text, |word| spellcheck::is_misspelled(word, language))
        .into_iter()
        .map(|range| [range.start, range.end])
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spell_check_catalog_lists_every_known_language_exactly_once() {
        let catalog = spell_check_catalog();
        assert_eq!(catalog.len(), SpellCheckLanguage::ALL.len());
    }

    #[test]
    fn spell_check_misspellings_is_always_empty_when_spell_check_is_off() {
        // `Off` never consults a dictionary, so this is deterministic
        // regardless of what's downloaded on the machine running the test.
        let spans = spell_check_misspellings(
            "this txt has plenty of typos".to_string(),
            SpellCheckLanguage::Off,
        );
        assert!(spans.is_empty());
    }
}
