import { filterCandidates } from "./autocomplete";

// A vim/Helix-style `:` command line — port of app/src/ui/command_prompt.rs's
// parse_command/completions/apply_completion, minus Command::Plugin (no
// plugin engine in this port, same reason MenuBar's own Reload Plugins stays
// a stub).
export type DarkModeChoice = "dark" | "light" | "system";

export type GitCommand =
  | { kind: "enable" }
  | { kind: "commit"; message: string | null }
  | { kind: "push" }
  | { kind: "pull" }
  | { kind: "backup"; message: string | null };

export type Command =
  | { kind: "save" }
  | { kind: "quit" }
  | { kind: "saveAndQuit" }
  | { kind: "open"; title: string }
  | { kind: "new"; title: string }
  | { kind: "darkMode"; choice: DarkModeChoice }
  | { kind: "colorTheme"; id: string | null }
  | { kind: "git"; command: GitCommand }
  | { kind: "find"; query: string }
  | { kind: "tag"; query: string }
  | { kind: "toggleSpellCheck" }
  | { kind: "daily" };

export type ParseResult = { ok: true; command: Command } | { ok: false; error: string };

/** The canonical, completable name for each command — biased toward the
 * descriptive long form where one exists ("write", not "w"), same reasoning
 * as the real app's own COMMAND_NAMES: short aliases like w/q/x still work
 * typed in full, they just aren't themselves completion targets. */
export const COMMAND_NAMES = ["write", "quit", "wq", "open", "new", "dmode", "theme", "git", "find", "tag", "spell", "daily"];
export const DARK_MODE_CHOICES: DarkModeChoice[] = ["dark", "light", "system"];
export const GIT_SUBCOMMANDS = ["enable", "commit", "push", "pull", "backup"];

function splitFirst(input: string): [string, string] {
  const idx = input.search(/\s/);
  if (idx === -1) return [input, ""];
  return [input.slice(0, idx), input.slice(idx).trimStart()];
}

export function parseCommand(input: string): ParseResult {
  const trimmed = input.trim().replace(/^:/, "").trim();
  if (!trimmed) return { ok: false, error: "Empty command" };
  const [name, rest] = splitFirst(trimmed);

  switch (name) {
    case "w":
    case "write":
      return { ok: true, command: { kind: "save" } };
    case "q":
    case "quit":
      return { ok: true, command: { kind: "quit" } };
    case "wq":
    case "x":
      return { ok: true, command: { kind: "saveAndQuit" } };
    case "o":
    case "open":
      return rest
        ? { ok: true, command: { kind: "open", title: rest } }
        : { ok: false, error: "Usage: :open <title>" };
    case "new":
      return rest
        ? { ok: true, command: { kind: "new", title: rest } }
        : { ok: false, error: "Usage: :new <title>" };
    case "dmode":
      if (rest === "dark" || rest === "light" || rest === "system") {
        return { ok: true, command: { kind: "darkMode", choice: rest } };
      }
      return { ok: false, error: "Usage: :dmode dark|light|system" };
    case "theme":
      if (rest.toLowerCase() === "default") return { ok: true, command: { kind: "colorTheme", id: null } };
      if (rest) return { ok: true, command: { kind: "colorTheme", id: rest.toLowerCase() } };
      return { ok: false, error: "Usage: :theme <name> (or :theme default)" };
    case "git":
      return rest
        ? parseGitSubcommand(rest)
        : { ok: false, error: "Usage: :git enable|commit|push|pull|backup [message]" };
    case "find":
      return { ok: true, command: { kind: "find", query: rest } };
    case "tag":
      return { ok: true, command: { kind: "tag", query: rest } };
    case "spell":
      return { ok: true, command: { kind: "toggleSpellCheck" } };
    case "daily":
      return { ok: true, command: { kind: "daily" } };
    default:
      return { ok: false, error: `Unknown command: ${name}` };
  }
}

function parseGitSubcommand(rest: string): ParseResult {
  const [sub, message] = splitFirst(rest);
  const msg = message.trim() || null;
  switch (sub) {
    case "enable":
      return { ok: true, command: { kind: "git", command: { kind: "enable" } } };
    case "commit":
      return { ok: true, command: { kind: "git", command: { kind: "commit", message: msg } } };
    case "push":
      return { ok: true, command: { kind: "git", command: { kind: "push" } } };
    case "pull":
      return { ok: true, command: { kind: "git", command: { kind: "pull" } } };
    case "backup":
      return { ok: true, command: { kind: "git", command: { kind: "backup", message: msg } } };
    default:
      return { ok: false, error: `Unknown git subcommand: ${sub}` };
  }
}

export type CompletionTarget = { kind: "commandName" } | { kind: "argument"; command: string; query: string };

export function completionTarget(input: string): CompletionTarget {
  const idx = input.search(/\s/);
  if (idx === -1) return { kind: "commandName" };
  return { kind: "argument", command: input.slice(0, idx), query: input.slice(idx).trimStart() };
}

const MAX_SUGGESTIONS = 8;

export function completions(
  input: string,
  noteTitles: string[],
  themeIds: string[],
  tagNames: string[],
  gitEnabled: boolean,
): string[] {
  const target = completionTarget(input);
  let matches: string[];
  if (target.kind === "commandName") {
    matches = filterCandidates(COMMAND_NAMES, input);
    if (!gitEnabled) matches = matches.filter((name) => name !== "git");
  } else if (target.command === "o" || target.command === "open") {
    matches = filterCandidates(noteTitles, target.query);
  } else if (target.command === "dmode") {
    matches = filterCandidates(DARK_MODE_CHOICES, target.query);
  } else if (target.command === "theme") {
    matches = filterCandidates(themeIds, target.query);
    if ("default".startsWith(target.query.toLowerCase())) matches = ["default", ...matches];
  } else if (target.command === "tag") {
    matches = filterCandidates(tagNames, target.query);
  } else if (target.command === "git") {
    matches = !gitEnabled || /\s/.test(target.query) ? [] : filterCandidates(GIT_SUBCOMMANDS, target.query);
  } else {
    matches = [];
  }
  return matches.slice(0, MAX_SUGGESTIONS);
}

/** Splice `chosen` into `input` at the position `completions` suggested it
 * for. */
export function applyCompletion(input: string, chosen: string): string {
  const target = completionTarget(input);
  if (target.kind === "commandName") return `${chosen} `;
  return `${target.command} ${chosen}`;
}
