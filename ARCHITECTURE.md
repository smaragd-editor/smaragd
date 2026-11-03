# Architecture

A map of Smaragd's codebase for contributors — what lives where, and how the pieces fit together. For what the app *does*, see the [README](README.md) and the [user manual](docs/user-manual.md); for how to build/test/release it, see the README's [Development](README.md#development) and [Releases](README.md#releases) sections.

The repo is a Cargo workspace of three Rust crates plus one frontend, not a single `src/` tree:

- **`core/`** (`smaragd-core`) — pure, portable application logic: project storage, export/import, sync/collab, the editor's text-buffer model. No `egui`/`eframe` and no native-integration (`rfd`/`arboard`/`opener`/`notify-rust`) dependency, so both frontends below can drive it identically. Unit-tested.
- **`app/`** (`smaragd`) — the original egui/eframe desktop app, **still the one real users get** (see README's Releases section). Everything egui-specific — rendering, native dialogs, OS clipboard/notifications — lives here, on top of `core/`. Verified manually, not with automated tests.
- **`app-tauri/`** (`smaragd-tauri`) + **`frontend/`** — an in-progress Tauri + Svelte rewrite of the same app, consuming `core/` from the Rust side (`app-tauri/`) with a Svelte UI (`frontend/`) talking to it over Tauri's IPC bridge. Not yet shipped to real users — see README's "Tauri pre-releases" section for how it's released as it matures.

**Not everything "portable" is actually shared.** A few things look like they should live in `core/` and sync between both frontends, but don't, by deliberate choice — know these before assuming parity:

- **Settings.** `app/src/settings.rs` (~1500 lines, ~43 fields) is the egui app's own `Settings`, saved to `smaragd.toml`. `core/src/settings.rs` (~600 lines) is a *separate*, independently-written struct for the Tauri app, saved to `smaragd-tauri.toml`. They're not the same type and neither imports the other — kept apart on purpose so the two apps can coexist on one machine during the migration without either's save silently corrupting or dropping fields from the other's file. `egui`-coupled fields (`ThemePreference`, font handles, `egui::KeyboardShortcut`-keyed shortcuts) obviously couldn't move to `core/` anyway; the rest is duplicated rather than shared.
- **Color themes.** Likewise two independent modules: `app/src/color_theme.rs` applies `egui::Visuals`; `core/src/color_theme.rs` is a 4-hex-color palette the Tauri frontend applies as CSS custom properties. Values are copied by hand so a theme looks the same in both apps.
- **Plugins** are the one case that *is* actually shared: `core/src/plugins.rs` holds the real `.rhai` engine, and both `app/src/plugins.rs` (a thin shim converting `core::settings::KeyCombo` to `egui::KeyboardShortcut`) and `app-tauri/src/plugins.rs` (plain Tauri commands) wrap it directly — a plugin script works unmodified on either app.
- **Autocomplete/double-tap-shift** (`app/src/autocomplete.rs`, `app/src/double_tap.rs`) are pure, egui-free logic that nonetheless stayed in `app/` rather than moving to `core/`: nothing needed them shared, so the Tauri frontend just has its own TypeScript reimplementations (`frontend/src/autocomplete.ts`, `frontend/src/doubleTapShift.ts`) instead.

## `core/`

```
core/src/
  lib.rs                  crate root: module list + the "no egui/native deps" doc comment above
  markdown.rs             markdown -> Block/Span parser (pulldown-cmark + wikilinks + inline #tag scanning)
  frontmatter.rs          YAML frontmatter parsing (DocumentMeta) + write-back + stripping for preview
  fuzzy.rs                fzf-style subsequence fuzzy matching (nucleo-matcher) for quick-switchers and Search Everywhere
  search.rs               plain-text find/replace across a chosen SearchScope
  git.rs                  thin wrapper over the system `git` binary (init/commit/push/pull)
  plugins.rs              the real `.rhai` plugin engine: custom `:` commands + the on_save hook — shared verbatim by both frontends (see above)
  pomodoro.rs             Pomodoro work/break state machine (pure, ticked once per frame/timer-event regardless of dock-tab visibility)
  streak.rs               Writing Streak evaluation (pure): WeeklySchedule, evaluate_streak (judges only completed Mon-Sun weeks), prune_daily_history
  dashboard.rs            pure Dashboard aggregation: SessionRecord + the day/weekday/hour bucketing functions its charts are built from
  document_history.rs    DocumentHistory: one open tab's own Back/Forward lineage (seeded from whichever tab was active when it opened)
  editor/mod.rs           EditorState: a collection of OpenDocument tabs, open/close/save per tab, per-tab dirty tracking and Back/Forward history
  color_theme.rs          Helix-style palette as 4 hex colors — the Tauri-side counterpart of app/src/color_theme.rs (see above); not shared with it
  settings.rs             the Tauri app's own Settings (smaragd-tauri.toml) — a separate struct from app/src/settings.rs, not shared (see above)
  fonts.rs                embedded font bytes shared by export rendering (export::latex/pdf) and the egui app's own font registration (app::editor_font)
  templates.rs            `${{name}}`/`${{date}}` substitution for New From Template and Daily Notes
  project_template.rs     Scrivener-style New Project templates: built-in Blank/Novel/Nonfiction/Screenplay/World-Building + loaded-from-disk custom ones, apply()/save_from_project()
  attachments.rs          saving a pasted/dropped attachment (image, PDF, ...) to disk + the markdown snippet to insert — shared terminal step for clipboard/paste/drag-drop
  backup.rs               zip-based Scrivener-style project backups: timestamped snapshot to a shared backup dir, oldest pruned past a configured count. Pure fs logic; app/app-tauri decide *when* to call it
  spellcheck.rs           Hunspell-compatible spell-check (spellbook): misspelled_word_spans (pure tokenizer) + dictionary lookup, memoized and invalidatable; real dictionaries are hosted in the separate smaragd-dictionaries repo, fetched at runtime with SHA-256 verification
  debug_flags.rs          runtime toggles for verbose debug logging (--debug-sync/--debug-save), read from anywhere via sync_enabled()/save_enabled()
  save_debug.rs           temporary instrumentation for an intermittent, unreproduced EISDIR save failure — remove once the root cause is found
  collab/
    mod.rs                 CollabSession: the app-facing surface tying crdt/diff to a running net session
    crdt.rs                 CRDT document (Yjs/yrs), proven convergent against in-process documents
    diff.rs                 text diffing (old vs. new buffer -> TextChange) + cursor adjustment on remote edits
    ticket.rs                the pasteable connection code: iroh EndpointAddr + session secret, postcard + base58
    crypto.rs                app-level end-to-end encryption layered on top of iroh's transport security (directional keys, implicit counter nonces, host identity folded into key derivation)
    net.rs                   iroh networking on its own background thread/tokio runtime: pairing handshake, encrypted frame exchange
  sync/
    mod.rs                 module overview; the sync core is pure and synchronous, only client.rs talks to the network
    crypto.rs               passphrase -> key (NFKC + Argon2id + blake3 subkey) and sealing/opening updates (XChaCha20-Poly1305, random nonce, AAD bound to vault + doc + key version)
    crdt.rs                 FileDoc: one synced markdown file as a CRDT (frontmatter keys as per-key registers + body as text)
    manifest.rs             ManifestDoc: doc id -> {path, kind (file/folder), deleted} CRDT (renames/deletes merge; deletes are tombstones) + path-safety checks for untrusted paths
    meta_crdt.rs            project.json (ProjectMeta) as a CRDT: SyncedFields (id-keyed snapshot; per-device fields like plugins_enabled never sync; paths <-> stable ids via PathIds) + MetaDoc (settings as registers, prose as text, order/cards/bookmarks as arrays)
    engine.rs               SyncEngine::sync_once: one reconcile pass between a project folder and a vault (files, folders and project.json: capture local edits, pull/merge, apply renames/deletes, push, then replace a document's accumulated updates with a snapshot once it has ~64); transport-agnostic
    engine/binaries.rs      non-Markdown files (images, PDFs, ...) when the project's sync_files is on: synced whole, not merged — each version a header (id, lineage, size, BLAKE3 hash) plus <=4 MiB chunks in the document's update log; the latest *complete* version wins, the losing author keeps a conflict copy, and older versions are trimmed with a snapshot
    transport.rs            the SyncTransport trait: the engine's blocking, data-plane-only view of the server (pulls are paged: follow `more`)
    state.rs                StateStore (+ DirStateStore over ProjectStore, MemoryStateStore for tests): local CRDT state between runs
    client.rs               native-only ureq HttpClient/HttpTransport: control plane (create vault, pairing, devices) + data plane
    pairing.rs              native-only one-off server operations behind the panel (create vault with admin-token fallback, join with a ticket, make ticket, list/revoke devices, leave); plain functions so they are testable against a real server
    link.rs                 ProjectLink (.smaragd/sync.json: non-secret server/vault/salt) + DeviceCredentials (token, kept in the OS data dir, never in the project)
    runner.rs               native-only SyncRunner: the engine on a background thread (key derivation happens there too), interval + on-demand passes, SyncEvents to the UI; unreachable = Offline (retries), wrong passphrase / revoked = Halted
    fake.rs                 (tests only) in-memory server for simulating several devices
    demo.rs                 an ephemeral, no-server sync demo wiring a real SyncEngine to `fake`'s in-memory transport — written for an early Tauri-port milestone before real pairing existed; **superseded** by `app-tauri/src/vault.rs`, which wires the same engine to real pairing/transport instead. Gated behind `test-support`; kept around, not deleted
  export/
    mod.rs                 gather() (binder walk, Trash/Templates-skipping) + shared ExportDoc/BookMeta/ExportError
    style.rs                TypesetStyle: built-in + loaded-from-.toml typesetting styles shared by all 4 formats
    docx.rs                 DOCX rendering (docx_rs)
    epub.rs                 EPUB rendering (epub_builder)
    pdf.rs                  print-PDF rendering via the embedded Typst compiler (typst-as-lib)
    latex.rs                LaTeX source generation (.tex + an images/ folder) for the user's own XeLaTeX/LuaLaTeX to compile -- no embeddable engine, so this ships source rather than a finished file (issue #126)
  import/
    mod.rs                 shared ImportedNode type + write_imported_tree, which stamps a parsed manuscript into a real Project via the same APIs project_template uses — no format-specific code touches BinderTree directly
    docx.rs                 DOCX import: splits into one document per Heading 1, falling back to a single document if there's none
    epub.rs                 EPUB import: one document per chapter, using the format's own spine order
    pdf.rs                  PDF import: a single document, plain text only (no formatting/chapter structure — the format has no semantic markup to recover)
    scrivener.rs             Scrivener project import: its Draft/manuscript folder maps to smaragd's Manuscript role; Trash is skipped
  project/
    mod.rs                 Project: type defs (FolderRole, ProjectMeta, StoryCard, ...) + core lifecycle/CRUD (load/initialize/rescan, create/rename/delete/move)
    store.rs               ProjectStore trait (read/write/list/rename/delete by path) + NativeStore (std::fs); the I/O boundary all of project/, settings.rs, backup.rs, plugins.rs, and spellcheck.rs go through instead of touching the filesystem directly
    model.rs                BinderTree/BinderNode data model
    scan.rs                 folder -> BinderTree via ignore::WalkBuilder
    roles.rs                folder-role assignment/lookup, trash_path/deletes_to_trash
    create.rs                new document/folder creation + manual-order bookkeeping
    rename_move_delete.rs   rename/move/delete, including name-collision handling (uniquify vs. refuse)
    rename_tag.rs            project-wide #tag rename: every document's frontmatter tags: entry and every inline #tag mention
    trash.rs                restore-from-trash/empty-trash/permanent-delete
    sanity_check.rs          startup check: project.json's path-keyed metadata vs. what's actually on disk, plus unresolved git merge-conflict markers — purely informational, nothing auto-repaired
    story_cards.rs          story cards (Cause/Effect/Why It Matters/Realization/And So, plus Prior/New Belief, Value Shift, Knowledge Gained, and many-to-many linked documents) + protagonist Desire/Misbelief + manuscript_document_stems (the Manuscript-role-restricted linking candidate list)
    queries.rs              backlinks + tag index/search
    word_count.rs           word count (WordCountScope-aware tree walk), is_path_tracked, Draft/Session target persistence, daily_word_counts rollover (feeds Streak)
    streak.rs                per-project Streak config setters (enable flag, weekly schedule, evaluation mode, red threshold)
    picklists.rs            Type/Status/POV dropdown-source folders
    bookmarks.rs            project-wide line bookmarks: set from the Editor gutter/shortcut, dangle (not auto-removed) if their document is renamed/moved/deleted
    notes.rs                project-wide notes pinned to a (path, line, column), unlike a bookmark's line-only granularity
    daily_notes.rs          daily-notes enable flag + template setting
    folder_meta.rs          folder-level metadata (same shape as document frontmatter, only `status` currently does anything)
    meta.rs                 ProjectMeta: manual ordering + per-node metadata the filesystem can't express, keyed by `/`-separated relative path; every map field is a BTreeMap for portable, unambiguous JSON
    activity.rs             per-project app-session tracking (start/end), feeding Dashboard's session stats
    attachments.rs          where a pasted/dropped attachment is saved (next to the document, or a configured folder) + the clipboard-image size cap
    binder_color_mode.rs    BinderColorMode: which value (Off/Status/POV/Word Count Progress) drives a binder row's background color
    pov_colors.rs           per-POV hex color assignment lookup/setter
    status_colors.rs        per-Status hex color assignment lookup/setter
```

## `app/`

```
app/src/
  main.rs                 entry point: eframe::run_native, window icon (decoded by build.rs), debug-flag parsing
  lib.rs                  crate root: module list, re-exports SmaragdApp
  app/                    SmaragdApp itself — split in a 2026-07-31 refactor out of one 766-line app.rs; see mod.rs
  ui/                     dockable-tab + modal rendering — see below
  autocomplete.rs         wikilink-autocomplete query/filter/completion logic (plain prefix/substring match) — pure, but not shared with core (see intro)
  double_tap.rs           double-tap-Shift gesture detector (pure state machine over egui ModifiersChanged events) that opens Search Everywhere — pure, but not shared with core (see intro)
  clipboard.rs            OS clipboard image access (arboard) for pasting into the editor — kept out of core since it's a native-integration dependency
  color_theme.rs          built-in + loaded-from-.toml color themes, egui::Visuals application — separate from core::color_theme (see intro)
  editor_font.rs          the curated Editor/Preview font set (reusing core::fonts' bytes) and registering it with egui
  notifications.rs        thin wrapper over notify-rust for OS-level desktop notifications (currently just Pomodoro phase changes)
  plugins.rs              thin egui-side shim over core::plugins — converts KeyCombo to egui::KeyboardShortcut at the one remaining egui-specific boundary
  pomodoro.rs             egui-side glue around core::pomodoro's state machine (resolves configured durations, ticks once per frame)
  session.rs              SessionState: everything "Reopen project on launch" restores beyond the project itself (open document/cursor, binder selection, history, Focus Mode, window geometry) — saved to session.json
  settings.rs             app-wide preferences: load/save smaragd.toml — the egui app's own Settings, not shared with core::settings (see intro)
  shortcuts.rs            ShortcutAction <-> egui::KeyboardShortcut map, load/save, guards against binding a shortcut that would make some character untypable
  egui_test_support.rs    (test-only) shared egui test-harness fixtures

app/src/app/               (impl SmaragdApp, one file per concern)
  mod.rs                  the SmaragdApp struct itself + its submodule list
  dock.rs                 DockTab enum + default_dock_state/ensure_editor_tab_present — Binder/Backlinks/Metadata/Editor/Preview/Corkboard/etc. all live in one shared egui_dock::DockState
  dock_tabs.rs            open/close a dock tab (toggle_dock_tab)
  dock_tab_viewer.rs      AppTabViewer (egui_dock::TabViewer impl) + DockAction — deferred mutations the viewer's &mut-self-only `ui()` can't apply directly, applied once the dock finishes rendering for the frame
  menu_bar.rs             renders the top File/Edit/View/Tools/Versions/Window/Help menu bar (hidden in Focus Mode)
  menu_nav.rs             keyboard navigation helpers (arrow keys, Alt-mnemonics) shared by every nested submenu
  project_lifecycle.rs    open/create/close a project; resolves which ProjectStore self.editor's I/O should go through
  project_settings.rs     applies a Project Settings dialog event (ui::project_settings_panel) to the open project
  prompt.rs               PromptAction: what a name-prompt modal does once confirmed (new file/folder, rename, new-from-template, new project)
  refresh.rs              BacklinksState/TagsState/MetadataState/WordCountState: per-frame cache-invalidation plumbing feeding the dock panels
  search_everywhere.rs    candidate gathering (documents/text/actions/settings) for the Search Everywhere modal
  session.rs              restore_session/persist_session, tying session.rs's SessionState to the live SmaragdApp
  settings_persist.rs     resolves the real settings path (or a test fixture's override) — the one place persistence methods are allowed to do so
  spell_check.rs          the language the Editor actually checks against right now (Focus Mode override vs. normal)
  streak_events.rs        handles ui::streak_panel::StreakEvent
  structural_undo.rs      StructuralOp: the most recent binder rename/move, for a single-level Undo Last Rename/Move
  sync.rs                 background sync wiring — see "Sync in the egui app" below
  toast.rs                floating, auto-dismissing error-severity notifications
  word_count_events.rs    handles ui::word_count_panel::WordCountEvent
  auto_commit.rs          periodic git commit (and optional push) on an interval, per ProjectMeta::git_auto_commit_enabled
  backup.rs               BackupTrigger (Open/Close/Save) -> core::backup invocation, gated by the matching Settings toggle
  bookmarks.rs            next/previous-bookmark navigation, project-wide
  collab.rs               wires core::collab's CollabSession into the UI (repaint-notifier closure, live-session checks) — see "Sync in the egui app" below for the sibling sync.rs
  daily_notes.rs          open/create today's daily note, optionally from the configured template
  dictionary_download.rs  kicks off a spell-check dictionary download on a background thread
  export.rs               ExportState: the open Export dialog's source folder + live book title/subtitle/author fields
  external_watch.rs       polls for changes made outside the app (another program, git pull, a sync merge) — see "Sync in the egui app" below
  find_replace.rs         resolves which documents a find/replace scope actually covers
  git.rs                  GitOperation (Push/Pull): tracks which network-bound git action a background thread is running, for reacting once it finishes
  import.rs               DOCX/EPUB/Scrivener/PDF import via a native file dialog, wired to core::import
  notes.rs                next/previous-note navigation, project-wide
  pomodoro.rs             handles ui::pomodoro_panel::PomodoroEvent

app/src/ui/                 (dockable-tab + modal rendering)
  about_panel.rs          Help > About modal: version + build info
  backlinks_panel.rs      backlinks list rendering (dockable tab)
  tags_panel.rs           tags list + tag search rendering (dockable tab)
  binder_panel.rs        binder tree rendering + right-click context menu + drag-and-drop move/reorder (dockable tab)
  editor_panel.rs         text editor + wikilink autocomplete popup + Focus Mode's paragraph-dimming layouter + the tab strip when multi-tab editing is on (dockable tab)
  markdown_preview.rs     style-driven manuscript preview rendering — same `TypesetStyle` export uses (dockable tab)
  corkboard_panel.rs      story-card grid + tabbed card editor modal (Plot / Belief and Knowledge / Third Rail) (dockable tab)
  story_grid_panel.rs     read-only, manuscript-ordered table view of the same story cards, resolved against multiple linked documents per card (dockable tab)
  belief_timeline_panel.rs  a chosen character's story cards chained in manuscript order as Prior Belief -> New Belief (dockable tab)
  metadata_panel.rs       document-metadata form editor, live-binding; also renders the project-wide Title/Subtitle/Author/Logline/What-if/Synopsis form shown when the binder's root row is selected (dockable tab)
  bookmarks_panel.rs      bookmarks list rendering (dockable tab)
  notes_panel.rs          notes list rendering (dockable tab)
  dashboard_panel.rs      session/word-count/document bar charts (egui_plot) + day-of-week/hour-of-day activity charts, rendering core::dashboard's aggregation (dockable tab)
  version_activity_panel.rs  dirty files, recent commit history, and a log of this session's own git actions (dockable tab)
  open_document_prompt.rs fzf-style quick-switcher modal for Open Document
  recent_files_prompt.rs  IntelliJ-style Recent Files switcher — toggles between recently-edited and recently-opened on repeat activation
  search_everywhere.rs    IntelliJ-style Search Everywhere modal: documents, text, actions, and settings (settings_panel::SETTINGS_INDEX) in tabs
  find_replace_panel.rs   find/replace panel rendering
  command_prompt.rs       `:` command parsing, completion, and prompt rendering
  settings_panel.rs       settings dialog rendering: category nav + per-category content (incl. shortcut remapping)
  project_settings_panel.rs  Project Settings dialog rendering: Git/Sync/Binder/Attachments/Daily Notes categories, scoped to one open Project
  name_prompt.rs          new file/folder/new-from-template/rename/new-project name-prompt modal rendering
  new_project_template_prompt.rs  template-choice step shown before the New Project name prompt
  move_file_prompt.rs     fzf-style folder picker for the Editor ☰ menu's "Move file to..." (deliberately not an OS dialog — a move can't leave the project)
  note_prompt.rs          modal for writing/editing a Note at a specific (path, line, column)
  export_panel.rs         export dialog: Title/Subtitle/Author/Style + DOCX/EPUB/Print PDF/LaTeX buttons
  pomodoro_panel.rs       Pomodoro dock tab: countdown + Start/Pause/Skip/Reset
  word_count_panel.rs     Word Count dock tab: scope toggle, Draft/Session Target progress bars, characters-typed counter
  collab_panel.rs         Collaborate dock tab: connection code / peer fingerprint + Host/Join/End
  sync_panel.rs           Sync dock tab: status, last sync, pairing ticket, device list + revoke, stop syncing (pure rendering; app/app/sync.rs derives its data and handles its events)
  streak_panel.rs         Streak dock tab: Streak/Configure inner tabs, traffic-light badge, weekly schedule editing
  exit_confirm_prompt.rs  Save/Discard/Cancel modal shown when closing with unsaved edits (open document, or a story-card draft)
  external_conflict_prompt.rs  modal for when the open document changed on disk while it also had unsaved local edits
  git_commit_prompt.rs    multi-line commit-message review/edit modal, pre-filled from the configured template
  sanity_check_prompt.rs  one-time post-open dialog listing anything project::sanity_check::check found — dismiss-only
```

Binder, Backlinks, Tags, Metadata, Editor, Preview, Corkboard, Story Grid, Belief Timeline, Pomodoro, Word Count, Collaborate, Sync, and Streak all dock together in one shared area via [`egui_dock`](https://github.com/Adanos020/egui_dock), wired up in `app/app/dock.rs`/`dock_tab_viewer.rs`.

## `app-tauri/` + `frontend/`

The Tauri shell. `app-tauri/` is a thin Rust IPC layer: every file is `#[tauri::command]` functions (plus, for Pomodoro/Collab/Sync, a persistent background thread) calling straight into `core/`, serializing results as DTOs for the frontend. `frontend/` is the Svelte UI driving those commands via `@tauri-apps/api`'s `invoke()` (request/response) and `listen()` (push events).

```
app-tauri/src/
  lib.rs                  tauri::Builder setup: plugin registration (opener/dialog/clipboard-manager/notification), the full invoke_handler command list, pomodoro ticker startup
  main.rs                 entry point: calls smaragd_tauri_lib::run()
  project.rs              project open/create/close, binder tree, document read/save, markdown render, wikilink lookup, binder create/rename/delete/move/restore, color mode, search, project metadata fields
  project_settings.rs     Project Settings dialog commands: Git/Sync/Binder/Attachments/Daily Notes, plus Folder Roles and Status/POV colors
  panels.rs               the read-mostly dock-tab data: Backlinks, Tags, Metadata, Word Count, Streak, Bookmarks, Notes, Dashboard, Version Activity — all reusing existing core::project query methods, no new core logic
  story_cards.rs          story card list/upsert/delete/move commands
  plugins.rs              plugin IPC commands wrapping core::plugins directly — stateless, reloads from scratch each call rather than holding a live PluginEngine
  pomodoro.rs             the real core::pomodoro state machine ticked on a 1Hz background thread, pushing snapshot events rather than making the frontend poll
  collab.rs               core::collab wired to real push events: a background thread drains the session the moment new state is ready and emits it immediately, instead of egui's per-frame poll
  vault.rs                real multi-device sync: one-off pairing operations as async commands, plus a persistent background-thread runner (vault_start/stop/sync_now/set_held) pushing events — wraps core::sync::{pairing, runner, link} directly; supersedes core::sync::demo (see core/'s sync/ tree)
  git_ops.rs              real git enable/commit/push/pull commands, wired to the Versions-menu equivalent
  manuscript.rs           Export Manuscript + DOCX/EPUB/Scrivener/PDF Import commands, wired to the already-portable core::export/core::import
  settings.rs             app-wide preferences IPC: load/save smaragd-tauri.toml via core::settings, plus the built-in color-theme list
  spellcheck.rs           wraps core::spellcheck: dictionary catalog, download, misspellings
```

```
frontend/src/
  main.ts                 mounts App.svelte
  App.svelte              desktop shell: menu bar, global keyboard shortcuts, double-tap-Shift, top-level dialogs
  MobileShell.svelte       single-panel-at-a-time mobile navigation (bottom tab bar) — dockview's split/float/drag model doesn't fit a phone, so mobile gets its own shell reusing the same zero-prop panel components
  ProjectView.svelte       hosts the open project's content (DockLayout on desktop)
  DockLayout.svelte        desktop dockview-based split/float panel layout; falls back to StubPanel.svelte for any dock-tab id with no real component yet (none, currently — every tab has real content)
  panelRegistry.ts         the shared panel id -> title/component map, so DockLayout and MobileShell can't drift apart as panels are added
  BinderTree.svelte / CorkboardView.svelte / StoryGridView.svelte  binder tree / corkboard / story grid views, used directly by both desktop and mobile via panelRegistry
  MenuBar.svelte           desktop top menu bar
  CommandPrompt.svelte / commandPrompt.ts  `:` command prompt
  shortcuts.ts             keyboard shortcut handling, the TS counterpart of app/src/shortcuts.rs's ShortcutAction set
  autocomplete.ts          wikilink/`:`-command autocomplete — a TS reimplementation of app/src/autocomplete.rs's logic, not shared code (can't share a Rust module across the IPC boundary)
  doubleTapShift.ts        double-tap-Shift gesture detector for Search Everywhere — TS counterpart of app/src/double_tap.rs
  MarkdownEditor.svelte    the text editor component
  RenderedMarkdown.svelte  markdown preview rendering
  SearchEverywhere.svelte  Search Everywhere modal
  SettingsDialog.svelte / ProjectSettingsDialog.svelte  app-wide / per-project settings dialogs
  ExportDialog.svelte      export dialog
  GitCommitDialog.svelte   commit-message review/edit modal
  TemplatePickerDialog.svelte  new-project template picker
  PromptDialog.svelte      generic name-prompt modal
  NotePromptDialog.svelte  note editor modal
  RecentFiles.svelte       Recent Files switcher
  SanityCheckPrompt.svelte startup sanity-check findings dialog
  ExternalConflictPrompt.svelte  external-change conflict resolution modal
  AboutDialog.svelte       Help > About
  EmptyStateArt.svelte     empty-state illustration
  vault.ts                 the non-reactive half of sync's frontend integration: project open/close/save hooks that start/stop/update the vault runner regardless of whether SyncPanel happens to be mounted
  storyCards.ts            story card data helpers
  panels/                  dockable-tab content, each Svelte counterpart of an app/src/ui/*_panel.rs:
                             BacklinksPanel, BeliefTimelinePanel, BookmarksPanel, CollabPanel, DashboardPanel
                             (SVG bar charts, no charting library), EditorPanel, MetadataPanel, NotesPanel,
                             PomodoroPanel, PreviewPanel, StreakPanel, SyncPanel, TagsPanel,
                             VersionActivityPanel, WordCountPanel, and StubPanel (DockLayout's fallback
                             renderer for a future tab added before its real content exists)
  stores/                  Svelte 5 rune-based state (*.svelte.ts):
                             project (the central project state since Phase 5 — lifted out of ProjectView.svelte
                             so every dock panel reads/mutates the same state regardless of which dockview group
                             it's mounted in), plus dockLayoutRegistry, editorViewMode, exportRequest, focusMode,
                             inlineBacklinks, metadataSelection, noteRequest, previewZoom, promptDialog,
                             settingsRequest, settings, tagsRequest, templatePickerDialog, theme, toast,
                             viewport, wordCountRegistry
```

## Sync (self-hosted server)

**Experimental:** the vault format, envelope layout and HTTP API are not yet stable and may change without a migration path.

Sync keeps a project identical across a user's own devices through a **blind** server: it stores and relays sealed CRDT updates and can read none of them (contrast `collab/`, which is live, peer-to-peer and serverless). All merging happens on the clients. Files are CRDT documents (`sync/crdt.rs`); a manifest CRDT (`sync/manifest.rs`) maps stable document ids to paths, so renames and deletes merge too. Binary files, when a project opts in, are manifest entries of kind `file` whose update logs hold whole encrypted versions instead of CRDT updates (`sync/engine/binaries.rs`); the server can't tell the two apart. See the module docs in `core/src/sync/engine.rs` for the reconcile pass, the join/adoption rules, and the safety rails.

The server, the shared protocol crate, and the end-to-end tests live in separate
repos:

```
smaragd-editor/smaragd            this repo: core/ (shared sync engine) + the egui app (app/) + the Tauri app (app-tauri/, frontend/)
smaragd-editor/smaragd-sync       smaragd-sync-protocol/  wire types shared by client and server: ids,
                                                           encrypted-envelope layout + AAD, the SyncTicket
                                                           pairing code, HTTP API request/response types
                                                           (its rustdoc is the protocol reference)
                                   smaragd-sync-server/    the axum + SQLite server, its Dockerfile/compose
                                                           file and self-hosting README. Also runs unattended
                                                           housekeeping (maintenance.rs: expired pairing codes,
                                                           vaults with no devices left after a retention
                                                           period, vacuum when worthwhile) and has an operator
                                                           CLI (admin.rs: list/delete-vault/purge-empty/vacuum/
                                                           maintenance, destructive ones need --yes)
smaragd-editor/smaragd-sync-e2e   end-to-end tests: the real client + engine (via a git dependency on this
                                   repo) against the real server (via a git dependency on smaragd-sync)
```

Each of `core`, `app`, and `app-tauri` depends on `smaragd-sync-protocol` as a **git
dependency** (see their respective `Cargo.toml`s) rather than a path dependency, since
the crate no longer lives in this tree. `smaragd-sync-e2e` is kept out of both other
repos because it links the whole desktop app *and* the server: neither this repo's
Flatpak-vendored lockfile nor `smaragd-sync`'s Docker build should have to resolve the
other's dependency tree.

Where state lives: nothing secret goes inside the project folder (`git.rs` runs `git add -A`; `backup.rs` zips `.smaragd/`). The engine's CRDT state goes through `sync::state::StateStore` (an OS data-dir location, chosen by whichever app is running), keys are derived in memory from the passphrase and never written to disk, and the server holds only hashes of device tokens and pairing codes.

## Sync in the egui app

`app/src/app/sync.rs` owns everything app-side, modeled on `app/src/app/collab.rs`: a `SyncState` polled once per frame by `poll_sync`. It notices project open/close, loads the project's `ProjectLink` and this device's credentials, and starts/stops/restarts the runner whenever the settings, project or pairing change (a `Signature` of root + vault + passphrase + server; a runner that halted for a signature is not restarted until that changes). One-off server calls (create/join/ticket/devices/revoke/leave/test connection) run on short-lived threads and report back through a channel. Two integration rules worth knowing: when the engine reports `meta_written`, the app calls `Project::reload_metadata` (otherwise its next `save_metadata` would overwrite the merged file); and the app tells the engine which file has unsaved edits (`SyncRunner::set_held_paths`) so it is never overwritten on disk — the engine diffs the saved file against the version it was last in sync with, so the edit is merged with whatever arrived meanwhile rather than reverting it. A *clean* open file is just rewritten on disk and reloaded by the existing 2-second external-change scan (`app/src/app/external_watch.rs`).

## Sync in the Tauri app

`app-tauri/src/vault.rs` wires the same `core::sync` engine up for the Tauri app — real multi-device sync, not a stand-in. It wraps `core::sync::{pairing, runner, link}` directly: one-off server operations (create/join a vault, make a ticket, list/revoke devices, leave) are plain `async fn` commands running the blocking `pairing::*` calls, while the continuous background sync (`vault_start`/`vault_stop`/`vault_sync_now`/`vault_set_held`) is a persistent thread pushing `vault://event`s to the frontend over `tauri::Emitter`, the same wake-driven drain-thread shape `collab.rs` already proves for collaboration. This replaces an earlier, now-superseded stepping stone — `core::sync::demo` wires the same engine to an in-memory fake transport so the Tauri command layer could prove the event-push plumbing before real pairing existed; it's kept in the tree (gated behind `test-support`) but `vault.rs` is what actually runs now.

The held-file rule is ported too: `frontend/src/vault.ts`'s `vaultUpdateHeld`/`vaultAfterSave` call `vault_set_held` on every selection/dirty change, the same "never overwrite a file with unsaved edits" contract `app/src/app/sync.rs` keeps on the egui side. The egui app's other rule — reloading `Project::reload_metadata` after `meta_written`, so a stale in-memory copy doesn't clobber a merge on the next save — doesn't have a Tauri equivalent, but isn't needed either: every `app-tauri` command reloads its `Project` fresh from disk (`Project::load_from_folder`) rather than holding one across calls (see e.g. `panels.rs`'s/`project.rs`'s own `load()` helpers), so there's no in-memory copy that can go stale in the first place.
