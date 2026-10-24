// Create Project from Template (app/src/ui/new_project_template_prompt.rs):
// a modal listing the built-in Blank/Novel/Nonfiction/Screenplay/World-
// Building scaffolds plus any custom ones saved under the real app's own
// project_template::global_project_templates_dir, resolved to the chosen
// template's id, or null on Cancel/Escape — same promise-resolve shape as
// showPrompt/showConfirm in promptDialog.svelte.ts.
type PendingTemplatePicker = {
  resolve: (templateId: string | null) => void;
};

export const templatePickerDialog = $state<{ pending: PendingTemplatePicker | null }>({
  pending: null,
});

export function showTemplatePicker(): Promise<string | null> {
  return new Promise((resolve) => {
    templatePickerDialog.pending = { resolve };
  });
}
