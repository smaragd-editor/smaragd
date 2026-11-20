// Replaces window.prompt()/window.confirm() — WebKitGTK (and other WebView
// backends) renders those as a native dialog titled "JavaScript - <origin>",
// which looks like a stray browser popup in a desktop app. PromptDialog.svelte
// renders an in-app modal instead; this store is the single pending-request
// slot it reads from, resolved by the modal's own OK/Cancel/Escape handling.
type PendingPrompt = {
  kind: "prompt";
  message: string;
  defaultValue: string;
  resolve: (value: string | null) => void;
};

type PendingConfirm = {
  kind: "confirm";
  message: string;
  resolve: (value: boolean) => void;
};

export const promptDialog = $state<{ pending: PendingPrompt | PendingConfirm | null }>({
  pending: null,
});

export function showPrompt(message: string, defaultValue = ""): Promise<string | null> {
  return new Promise((resolve) => {
    promptDialog.pending = { kind: "prompt", message, defaultValue, resolve };
  });
}

export function showConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    promptDialog.pending = { kind: "confirm", message, resolve };
  });
}
