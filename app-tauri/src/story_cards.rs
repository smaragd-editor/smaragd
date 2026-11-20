use std::path::Path;

use smaragd_core::project::{Project, StoryCard};
use uuid::Uuid;

fn load(root: &str) -> Result<Project, String> {
    Project::load_from_folder(Path::new(root)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn story_cards_list(root: String) -> Result<Vec<StoryCard>, String> {
    Ok(load(&root)?.meta.story_cards)
}

#[tauri::command]
pub fn story_card_upsert(root: String, card: StoryCard) -> Result<Vec<StoryCard>, String> {
    let mut project = load(&root)?;
    project.upsert_story_card(card).map_err(|e| e.to_string())?;
    Ok(project.meta.story_cards)
}

#[tauri::command]
pub fn story_card_delete(root: String, id: Uuid) -> Result<Vec<StoryCard>, String> {
    let mut project = load(&root)?;
    project.delete_story_card(id).map_err(|e| e.to_string())?;
    Ok(project.meta.story_cards)
}

#[tauri::command]
pub fn story_card_move(root: String, id: Uuid, new_index: usize) -> Result<Vec<StoryCard>, String> {
    let mut project = load(&root)?;
    project
        .move_story_card(id, new_index)
        .map_err(|e| e.to_string())?;
    Ok(project.meta.story_cards)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn story_cards_round_trip_through_list_upsert_delete_and_move() {
        let dir = tempfile::tempdir().unwrap();
        smaragd_core::project::Project::initialize(dir.path()).unwrap();
        let root = dir.path().display().to_string();

        assert!(story_cards_list(root.clone()).unwrap().is_empty());

        let mut first = StoryCard::new();
        first.scene_number = "1".to_string();
        let mut second = StoryCard::new();
        second.scene_number = "2".to_string();
        let second_id = second.id;

        story_card_upsert(root.clone(), first).unwrap();
        let after_second = story_card_upsert(root.clone(), second).unwrap();
        assert_eq!(after_second.len(), 2);

        let moved = story_card_move(root.clone(), second_id, 0).unwrap();
        assert_eq!(moved[0].id, second_id);

        let after_delete = story_card_delete(root.clone(), second_id).unwrap();
        assert_eq!(after_delete.len(), 1);
        assert!(after_delete.iter().all(|c| c.id != second_id));

        assert_eq!(story_cards_list(root).unwrap().len(), 1);
    }

    #[test]
    fn story_card_delete_is_a_no_op_for_an_unknown_id() {
        let dir = tempfile::tempdir().unwrap();
        smaragd_core::project::Project::initialize(dir.path()).unwrap();
        let root = dir.path().display().to_string();
        story_card_upsert(root.clone(), StoryCard::new()).unwrap();

        let cards = story_card_delete(root, Uuid::new_v4()).unwrap();
        assert_eq!(cards.len(), 1);
    }
}
