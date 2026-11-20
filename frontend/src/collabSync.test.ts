import { describe, expect, it } from "vitest";
import { adjustCursor, byteOffsetToUtf16, type TextChange } from "./collabSync";

function change(pos: number, deleted_len: number, inserted: string): TextChange {
  return { pos, deleted_len, inserted };
}

describe("adjustCursor", () => {
  it("is unchanged when the edit is entirely after it", () => {
    const c = change(10, 3, "xyz");
    expect(adjustCursor(5, c)).toBe(5);
    expect(adjustCursor(10, c)).toBe(10);
  });

  it("shifts by the net length delta when entirely before it", () => {
    // A 3-byte deletion replaced by a 5-byte insertion: +2 net.
    const c = change(0, 3, "hello");
    expect(adjustCursor(3, c)).toBe(5);
    expect(adjustCursor(10, c)).toBe(12);
  });

  it("shifts back for a net deletion", () => {
    // A 5-byte deletion replaced by nothing: -5 net.
    const c = change(0, 5, "");
    expect(adjustCursor(10, c)).toBe(5);
  });

  it("clamps to the edit start when inside the deleted span", () => {
    const c = change(4, 6, "x");
    expect(adjustCursor(7, c)).toBe(4);
    expect(adjustCursor(9, c)).toBe(4);
  });

  it("never underflows on a large deletion before a small cursor", () => {
    const c = change(0, 100, "");
    expect(adjustCursor(0, c)).toBe(0);
  });

  it("uses the inserted text's byte length, not its UTF-16 length", () => {
    // "é" is 1 UTF-16 code unit but 2 UTF-8 bytes — a naive `.length`-based
    // delta would be off by one per non-ASCII character inserted.
    const c = change(0, 1, "é");
    expect(adjustCursor(5, c)).toBe(6);
  });
});

describe("byteOffsetToUtf16", () => {
  it("is identity for plain ASCII text", () => {
    expect(byteOffsetToUtf16("hello world", 5)).toBe(5);
  });

  it("accounts for multi-byte characters before the offset", () => {
    // "café" — "caf" is 3 ASCII bytes/chars, then "é" is 2 bytes but 1
    // UTF-16 code unit. Byte offset 5 (just past "é") is UTF-16 offset 4.
    expect(byteOffsetToUtf16("café", 5)).toBe(4);
    expect(byteOffsetToUtf16("café", 3)).toBe(3);
  });
});
