import { describe, expect, it } from "vitest";
import { filterCandidates } from "./autocomplete";

describe("filterCandidates", () => {
  it("ranks prefix matches before substring matches", () => {
    const result = filterCandidates(["zebra-foo", "foobar", "afoo"], "foo");
    expect(result).toEqual(["foobar", "afoo", "zebra-foo"]);
  });

  it("sorts each group alphabetically", () => {
    const result = filterCandidates(["foo-b", "foo-a"], "foo");
    expect(result).toEqual(["foo-a", "foo-b"]);
  });

  it("matches case-insensitively", () => {
    const result = filterCandidates(["Daily Note"], "daily");
    expect(result).toEqual(["Daily Note"]);
  });

  it("returns every candidate, prefix-sorted first, for an empty query", () => {
    const result = filterCandidates(["b", "a"], "");
    expect(result).toEqual(["a", "b"]);
  });

  it("returns nothing when no candidate matches", () => {
    expect(filterCandidates(["alpha", "beta"], "zzz")).toEqual([]);
  });
});
