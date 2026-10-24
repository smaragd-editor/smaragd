mod collab;
mod git_ops;
mod manuscript;
mod panels;
mod pomodoro;
mod project;
mod project_settings;
mod settings;
mod spellcheck;
mod story_cards;
mod sync;

use collab::CollabState;
use pomodoro::PomodoroHandle;
use sync::SyncState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .manage(PomodoroHandle::default())
        .manage(CollabState::default())
        .manage(SyncState::default())
        .invoke_handler(tauri::generate_handler![
            pomodoro::pomodoro_snapshot,
            pomodoro::pomodoro_start,
            pomodoro::pomodoro_pause,
            pomodoro::pomodoro_skip,
            project::project_open,
            project::project_templates_list,
            project::project_create_from_template,
            project::project_close,
            project::project_binder_tree,
            project::document_read,
            project::document_save,
            project::render_markdown,
            project::binder_create_document,
            project::template_documents,
            project::binder_create_document_from_template,
            project::binder_create_folder,
            project::binder_rename,
            project::deletes_to_trash,
            project::binder_delete,
            project::binder_restore,
            project::empty_trash,
            project::binder_move,
            project::binder_move_before,
            project::open_daily_note,
            project::cycle_binder_color_mode,
            project::set_binder_color_mode,
            project::search_everywhere_text,
            project::project_meta_fields,
            project::set_book_title,
            project::set_book_subtitle,
            project::set_book_author,
            project::set_project_point,
            project::set_project_logline,
            project::set_project_what_if,
            project::set_project_synopsis,
            project_settings::project_settings,
            project_settings::set_project_daily_notes,
            project_settings::set_folder_role,
            project_settings::folder_role,
            project_settings::is_trashed,
            project_settings::is_picklist_folder,
            project_settings::set_picklist_folder,
            project_settings::set_status_color,
            project_settings::clear_status_color,
            project_settings::set_pov_color,
            project_settings::clear_pov_color,
            project_settings::picklist_options,
            project_settings::folder_metadata,
            project_settings::set_folder_metadata,
            story_cards::story_cards_list,
            story_cards::story_card_upsert,
            story_cards::story_card_delete,
            story_cards::story_card_move,
            collab::collab_status,
            collab::collab_host,
            collab::collab_join,
            collab::collab_end,
            collab::collab_sync_local_edit,
            sync::sync_demo_start,
            sync::sync_demo_stop,
            sync::sync_demo_now,
            panels::backlinks_for,
            panels::all_tags,
            panels::documents_with_tag,
            panels::document_metadata,
            panels::frontmatter_write_back,
            panels::word_count,
            panels::streak_status,
            panels::bookmarks_list,
            panels::bookmark_delete,
            panels::notes_list,
            panels::note_delete,
            panels::dashboard_summary,
            panels::version_activity,
            settings::settings_load,
            settings::settings_save,
            settings::color_themes_list,
            spellcheck::spell_check_catalog,
            spellcheck::spell_check_download,
            spellcheck::spell_check_misspellings,
            git_ops::git_enable,
            git_ops::git_commit_message_preview,
            git_ops::git_commit,
            git_ops::git_push,
            git_ops::git_pull,
            manuscript::manuscript_folders,
            manuscript::export_manuscript,
            manuscript::import_file,
            manuscript::import_scrivener,
        ])
        .setup(|app| {
            pomodoro::spawn_ticker(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running the Smaragd Tauri app");
}
