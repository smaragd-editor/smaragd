<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { EditorSelection, EditorState, StateEffect, StateField } from "@codemirror/state";
  import {
    EditorView,
    keymap,
    highlightActiveLine,
    lineNumbers,
    Decoration,
    type DecorationSet,
  } from "@codemirror/view";
  import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
  import { markdown } from "@codemirror/lang-markdown";
  import { languages } from "@codemirror/language-data";
  import { search, openSearchPanel, SearchQuery, setSearchQuery } from "@codemirror/search";
  import { effectiveCombo, SHORTCUT_ACTIONS } from "./shortcuts";
  import type { KeyCombo } from "./stores/settings.svelte";
  import {
    project,
    activateWikilinkAtCursor,
    toggleBookmarkAtCursor,
  } from "./stores/project.svelte";
  import { requestNoteAtCursor } from "./stores/noteRequest.svelte";

  // Phase 3 proof-of-concept: CodeMirror 6 in place of the plain <textarea>
  // from Phase 2. This is the highest-risk phase in the migration plan — the
  // whole motivation for leaving egui is that its text widgets have weak
  // IME/screen-reader/text-shaping support, and CodeMirror is where that bet
  // either pays off or doesn't. Keep this component plain (no custom theme,
  // no wikilink/tag decorations yet) so IME/a11y behavior can be judged
  // against a near-default CodeMirror setup first.
  let {
    value,
    onChange,
  }: {
    value: string;
    onChange: (text: string) => void;
  } = $props();

  let container: HTMLDivElement;
  let view: EditorView | undefined;

  // Spell Check's underline decorations — a plain StateField holding a
  // DecorationSet, updated via `setMisspellings`' effect rather than
  // recomputed from a document listener, since the ranges come from an
  // already-debounced Tauri call (stores/project.svelte.ts), not something
  // to redo on every keystroke here too.
  const setMisspellingsEffect = StateEffect.define<{ from: number; to: number }[]>();
  const misspellingsField = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(decorations, tr) {
      for (const effect of tr.effects) {
        if (effect.is(setMisspellingsEffect)) {
          return Decoration.set(
            effect.value.map((r) => Decoration.mark({ class: "cm-misspelled" }).range(r.from, r.to)),
          );
        }
      }
      return decorations.map(tr.changes);
    },
    provide: (field) => EditorView.decorations.from(field),
  });

  // Converts a KeyCombo's portable, DOM-ish key name (see
  // core::settings::KeyCombo's own doc comment) to CodeMirror's own keymap
  // key-string vocabulary — covers the same key set
  // core::plugins::is_known_key_name does, for the same reason (a shared,
  // small, named-key vocabulary everything in this app agrees on).
  function codeMirrorKeyName(key: string): string {
    const named: Record<string, string> = {
      enter: "Enter",
      escape: "Escape",
      backspace: "Backspace",
      tab: "Tab",
      arrowleft: "ArrowLeft",
      arrowright: "ArrowRight",
      arrowup: "ArrowUp",
      arrowdown: "ArrowDown",
      equal: "=",
      minus: "-",
    };
    if (key in named) return named[key];
    const fKey = /^f(\d{1,2})$/.exec(key);
    if (fKey) return `F${fKey[1]}`;
    return key;
  }

  function codeMirrorKeyFor(combo: KeyCombo | undefined): string | null {
    if (!combo || combo.key === "") return null; // unbound
    const parts: string[] = [];
    if (combo.ctrl_or_cmd) parts.push("Mod");
    if (combo.alt) parts.push("Alt");
    if (combo.shift) parts.push("Shift");
    parts.push(codeMirrorKeyName(combo.key));
    return parts.join("-");
  }

  // The three cursor-anchored actions real Markdown editing needs that
  // can't go through the global shortcut dispatcher (shortcuts.ts) the way
  // every other action does — they need CodeMirror's own cursor, which only
  // this component has, so they're declared `inlineConsumed` there and
  // consumed here instead, matching the real egui app's own editor_panel.rs
  // (shortcuts stolen directly inside the Editor pane, not dispatched
  // through its generic shortcut loop). Computed once at mount, not kept
  // live against a Settings remap — reopening the document/app picks up a
  // changed binding, same trade-off `extensions` as a whole already makes
  // by being built once here rather than through a reconfigurable
  // Compartment.
  function inlineShortcutsKeymap() {
    const bindings: { key: string; run: () => boolean }[] = [];
    const bind = (actionId: string, run: () => boolean) => {
      const action = SHORTCUT_ACTIONS.find((a) => a.id === actionId);
      const key = action && codeMirrorKeyFor(effectiveCombo(action));
      if (key) bindings.push({ key, run });
    };
    bind("activate_wikilink", () => {
      const cursor = getCursor();
      if (cursor) void activateWikilinkAtCursor(cursor.byteOffset);
      return true;
    });
    bind("toggle_bookmark", () => {
      const cursor = getCursor();
      if (cursor) void toggleBookmarkAtCursor(cursor.line);
      return true;
    });
    bind("add_note_at_cursor", () => {
      const cursor = getCursor();
      if (cursor && project.selectedPath) {
        requestNoteAtCursor(project.selectedPath, cursor.line, cursor.byteColumn);
      }
      return true;
    });
    return keymap.of(bindings);
  }

  onMount(() => {
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        inlineShortcutsKeymap(),
        markdown({ codeLanguages: languages }),
        search(),
        misspellingsField,
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChange(update.state.doc.toString());
          }
        }),
      ],
    });

    view = new EditorView({ state, parent: container });

    // TEMPORARY — diagnosing a report of the editor silently losing focus
    // to <body> on its own (see shortcuts.ts's own DEBUG_SHORTCUTS log,
    // which caught `target=BODY` on a keydown with no JS-visible cause).
    // `console.trace()` only shows a stack when the blur was *synchronously
    // caused by other JS on this call stack* (e.g. something calling
    // .focus() elsewhere) — an empty/browser-internal trace here would mean
    // the blur came from outside our code (window losing OS focus, the
    // element leaving the DOM, etc.), which is itself a useful data point.
    // Safe to strip once the cause is known.
    const onDomFocus = () => console.debug("[editor] dom focus gained");
    const onDomBlur = (e: FocusEvent) => {
      const related = e.relatedTarget as HTMLElement | null;
      console.debug(
        `[editor] dom blur — relatedTarget=${related ? related.tagName + (related.className ? "." + related.className : "") : "null"}`,
      );
      console.trace("[editor] blur call stack (empty/native = caused outside our JS)");
      requestAnimationFrame(() => {
        const active = document.activeElement as HTMLElement | null;
        console.debug(
          `[editor] one frame after blur, document.activeElement=${active ? active.tagName + (active.className ? "." + active.className : "") : "null"}`,
        );
      });
    };
    // Rules out "the whole webview window lost OS-level focus" (app
    // switched away, devtools clicked into, etc.) as a distinct cause from
    // "focus moved to another element within the page".
    const onWindowBlur = () => console.debug("[editor] window blur (OS-level)");
    const onWindowFocus = () => console.debug("[editor] window focus (OS-level)");
    view.dom.addEventListener("focus", onDomFocus);
    view.dom.addEventListener("blur", onDomBlur);
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("focus", onWindowFocus);
    debugCleanup = () => {
      view?.dom.removeEventListener("focus", onDomFocus);
      view?.dom.removeEventListener("blur", onDomBlur);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("focus", onWindowFocus);
    };
  });

  // TEMPORARY — see the debug listeners registered in onMount above.
  let debugCleanup: (() => void) | undefined;

  onDestroy(() => {
    debugCleanup?.();
    view?.destroy();
  });

  // Replace the document wholesale when a different file is opened (not on
  // every local keystroke — `onChange` already owns that direction, and
  // resetting on every update would fight the editor's own cursor/undo
  // history each time the caller echoes `value` back via a prop update).
  export function setDocument(text: string) {
    if (!view) return;
    // A no-op when the text is already current — e.g. registerEditor
    // (stores/project.svelte.ts) calls this unconditionally on every
    // (re)mount as a catch-up safety net for one specific race (a panel
    // reopened before `value`'s initial prop reflects the already-open
    // document), but that leaves it calling this right after `onMount`'s
    // own `EditorState.create({ doc: value, ... })` already set the exact
    // same text, every ordinary mount. A full `{from: 0, to: length}`
    // replace discards the whole change in one transaction, so even a
    // same-text one still asks CodeMirror to map the current selection
    // through it; skipping it entirely when nothing actually changed is
    // cheap insurance against that doing anything surprising to the cursor.
    if (text === view.state.doc.toString()) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text },
    });
  }

  // Deliberately not bound through CodeMirror's own searchKeymap (Ctrl+F/
  // Ctrl+H) — Find and Replace is dispatched through this app's own
  // shortcuts.ts/MenuBar instead, one consistent place every action goes
  // through rather than two parallel keybinding systems.
  export function openFindReplace(prefill?: string) {
    if (!view) return;
    if (prefill) {
      view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: prefill })) });
    }
    openSearchPanel(view);
  }

  // Backs Spell Check — `ranges` are already-converted UTF-16 positions
  // (stores/project.svelte.ts converts the backend's byte-offset spans).
  export function setMisspellings(ranges: { from: number; to: number }[]) {
    if (!view) return;
    view.dispatch({ effects: setMisspellingsEffect.of(ranges) });
  }

  // Moves keyboard focus into the editor without changing the cursor —
  // backs the Toggle Editor shortcut's focus-on-show (DockLayout.svelte's
  // showPanel), the editor counterpart of BinderTree.svelte's
  // focusSelectedOrTop for the Binder. Retries for a few animation frames
  // rather than a single attempt: the caller already waits for this
  // component to exist (see `focusEditor`'s own pending-flag deferral in
  // stores/project.svelte.ts), but something else in the same dockview
  // update — another panel's own focus/visibility change still settling —
  // can still steal focus back a frame or two later, which a one-shot
  // `view.focus()` can't recover from.
  export function focus(attemptsLeft = 10) {
    if (!view) return;
    view.focus();
    if (view.hasFocus || attemptsLeft <= 0) return;
    requestAnimationFrame(() => focus(attemptsLeft - 1));
  }

  // Backs the Next/Previous Bookmark and Note shortcuts — jumps to a line
  // without needing the caller to know anything about CodeMirror positions.
  export function gotoLine(line: number) {
    if (!view) return;
    const clamped = Math.min(Math.max(line, 1), view.state.doc.lines);
    const { from } = view.state.doc.line(clamped);
    view.dispatch({ selection: EditorSelection.cursor(from), scrollIntoView: true });
    view.focus();
  }

  const byteEncoder = new TextEncoder();

  // The cursor's position in the same terms `core::project::{bookmarks,notes}`
  // store it in — a 1-based logical line and a 0-based *byte* offset (not
  // UTF-16 code unit) within it, matching `Bookmark::line`/`Note::line`/
  // `Note::column`'s own doc comments — plus a whole-document byte offset
  // for `core::markdown::wikilink_target_at`. Backs the three inline
  // shortcuts above; exported too, in case a caller ever needs the open
  // cursor position without going through them.
  export function getCursor():
    | { line: number; byteColumn: number; byteOffset: number }
    | undefined {
    if (!view) return undefined;
    const head = view.state.selection.main.head;
    const lineInfo = view.state.doc.lineAt(head);
    const byteColumn = byteEncoder.encode(lineInfo.text.slice(0, head - lineInfo.from)).length;
    const byteOffset = byteEncoder.encode(view.state.doc.sliceString(0, head)).length;
    return { line: lineInfo.number, byteColumn, byteOffset };
  }
</script>

<div class="editor" bind:this={container}></div>

<style>
  .editor {
    height: 100%;
    min-height: 16rem;
    overflow: auto;
    text-align: left;
  }

  /* No CodeMirror theme extension is loaded, so by default its gutter/
     active-line colors stay hardcoded light regardless of the app's own
     dark mode — overridden here via its stable default class names rather
     than pulling in a full EditorView.theme() for just this. */
  .editor :global(.cm-editor) {
    height: 100%;
    font-size: 0.95rem;
    background: transparent;
    color: var(--color-fg);
  }

  .editor :global(.cm-gutters) {
    background: var(--color-bg-alt);
    color: var(--color-fg-muted);
    border-right: 1px solid var(--color-border);
  }

  .editor :global(.cm-activeLineGutter),
  .editor :global(.cm-activeLine) {
    background: var(--color-selected-bg);
  }

  .editor :global(.cm-misspelled) {
    text-decoration: underline wavy var(--color-danger);
    text-decoration-skip-ink: none;
  }
</style>
