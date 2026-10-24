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

  onMount(() => {
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
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
  });

  onDestroy(() => {
    view?.destroy();
  });

  // Replace the document wholesale when a different file is opened (not on
  // every local keystroke — `onChange` already owns that direction, and
  // resetting on every update would fight the editor's own cursor/undo
  // history each time the caller echoes `value` back via a prop update).
  export function setDocument(text: string) {
    if (!view) return;
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

  // Backs the Next/Previous Bookmark and Note shortcuts — jumps to a line
  // without needing the caller to know anything about CodeMirror positions.
  export function gotoLine(line: number) {
    if (!view) return;
    const clamped = Math.min(Math.max(line, 1), view.state.doc.lines);
    const { from } = view.state.doc.line(clamped);
    view.dispatch({ selection: EditorSelection.cursor(from), scrollIntoView: true });
    view.focus();
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
