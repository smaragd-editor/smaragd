import { describe, expect, it } from "vitest";
import { applyCompletion, completionTarget, completions, parseCommand } from "./commandPrompt";

describe("parseCommand", () => {
  it("parses save/quit/save-and-quit including their short aliases", () => {
    expect(parseCommand(":w")).toEqual({ ok: true, command: { kind: "save" } });
    expect(parseCommand("write")).toEqual({ ok: true, command: { kind: "save" } });
    expect(parseCommand("q")).toEqual({ ok: true, command: { kind: "quit" } });
    expect(parseCommand("x")).toEqual({ ok: true, command: { kind: "saveAndQuit" } });
  });

  it("requires an argument for :open and :new", () => {
    expect(parseCommand("open")).toEqual({ ok: false, error: "Usage: :open <title>" });
    expect(parseCommand("open My Note")).toEqual({
      ok: true,
      command: { kind: "open", title: "My Note" },
    });
  });

  it("rejects an invalid :dmode choice", () => {
    expect(parseCommand("dmode neon")).toEqual({
      ok: false,
      error: "Usage: :dmode dark|light|system",
    });
    expect(parseCommand("dmode dark")).toEqual({
      ok: true,
      command: { kind: "darkMode", choice: "dark" },
    });
  });

  it("lowercases the :theme id but keeps default distinct", () => {
    expect(parseCommand("theme Default")).toEqual({
      ok: true,
      command: { kind: "colorTheme", id: null },
    });
    expect(parseCommand("theme Solarized")).toEqual({
      ok: true,
      command: { kind: "colorTheme", id: "solarized" },
    });
  });

  it("parses every :git subcommand and treats a blank message as null", () => {
    expect(parseCommand("git commit")).toEqual({
      ok: true,
      command: { kind: "git", command: { kind: "commit", message: null } },
    });
    expect(parseCommand("git commit  fix typo ")).toEqual({
      ok: true,
      command: { kind: "git", command: { kind: "commit", message: "fix typo" } },
    });
    expect(parseCommand("git frobnicate")).toEqual({
      ok: false,
      error: "Unknown git subcommand: frobnicate",
    });
  });

  it("falls through to a plugin command only when no built-in matches", () => {
    expect(parseCommand("mycommand arg", ["mycommand"])).toEqual({
      ok: true,
      command: { kind: "plugin", name: "mycommand", arg: "arg" },
    });
    // "find" is built in, so it can never be shadowed by a plugin of the
    // same name — matches parseCommand's own doc comment.
    expect(parseCommand("find text", ["find"])).toEqual({
      ok: true,
      command: { kind: "find", query: "text" },
    });
  });

  it("rejects an empty or unknown command", () => {
    expect(parseCommand("   ")).toEqual({ ok: false, error: "Empty command" });
    expect(parseCommand("bogus")).toEqual({ ok: false, error: "Unknown command: bogus" });
  });
});

describe("completionTarget", () => {
  it("targets the command name before the first space", () => {
    expect(completionTarget("th")).toEqual({ kind: "commandName" });
  });

  it("targets the argument after the first space, trimming extra whitespace", () => {
    expect(completionTarget("open   My")).toEqual({
      kind: "argument",
      command: "open",
      query: "My",
    });
  });
});

describe("completions", () => {
  it("hides the git command name when git isn't enabled", () => {
    const withGit = completions("g", [], [], [], true);
    const withoutGit = completions("g", [], [], [], false);
    expect(withGit).toContain("git");
    expect(withoutGit).not.toContain("git");
  });

  it("completes :open against note titles", () => {
    const result = completions("open Dr", ["Draft One", "Draft Two", "Other"], [], [], false);
    expect(result).toEqual(["Draft One", "Draft Two"]);
  });

  it("always offers default as a :theme completion when it matches", () => {
    const result = completions("theme d", [], ["dracula"], [], false);
    expect(result[0]).toBe("default");
    expect(result).toContain("dracula");
  });

  it("suggests no :git subcommand once the user has typed a message", () => {
    const result = completions("git commit some message", [], [], [], true);
    expect(result).toEqual([]);
  });

  it("caps suggestions at 8", () => {
    const manyTags = Array.from({ length: 20 }, (_, i) => `tag${i}`);
    const result = completions("tag tag", [], [], manyTags, false);
    expect(result).toHaveLength(8);
  });
});

describe("applyCompletion", () => {
  it("appends a trailing space after completing the command name", () => {
    expect(applyCompletion("wr", "write")).toBe("write ");
  });

  it("rebuilds `<command> <argument>` when completing an argument", () => {
    expect(applyCompletion("open Dr", "Draft One")).toBe("open Draft One");
  });
});
