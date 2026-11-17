// Pure helpers for merging a remote collab text change into the local
// CodeMirror buffer without losing the local cursor position. Both ported
// from `core::collab::diff` (byte-offset arithmetic there; CodeMirror itself
// indexes in UTF-16 code units, hence `byteOffsetToUtf16`).

export type TextChange = { pos: number; deleted_len: number; inserted: string };

const byteEncoder = new TextEncoder();

/** Ported verbatim from `core::collab::diff::adjust_cursor`. All of
 * `cursorByte`/`change.pos`/`change.deleted_len` and the return value are
 * *byte* offsets, matching the Rust original and the wire DTO they came
 * from — `change.inserted`'s *byte* length (not its UTF-16 `.length`) is
 * what the net-delta math needs, since a single non-ASCII character (e.g.
 * "é") is one UTF-16 code unit but two UTF-8 bytes. Callers convert the
 * (byte) result to a UTF-16 offset via `byteOffsetToUtf16` before handing
 * it to CodeMirror. A cursor strictly inside the deleted range collapses to
 * the change's start, same as the Rust original. */
export function adjustCursor(cursorByte: number, change: TextChange): number {
  if (cursorByte <= change.pos) return cursorByte;
  if (cursorByte >= change.pos + change.deleted_len) {
    const insertedBytes = byteEncoder.encode(change.inserted).length;
    const delta = insertedBytes - change.deleted_len;
    return Math.max(0, cursorByte + delta);
  }
  return change.pos;
}

/** Converts a UTF-8 byte offset into `text` to a UTF-16 code-unit offset
 * (CodeMirror/JS string indexing) — identical to ASCII, genuinely different
 * for non-ASCII. A single-value counterpart of
 * `stores/project.svelte.ts`'s `byteSpansToUtf16`, which builds a lookup
 * table instead since it converts many spans at once; this only ever needs
 * one value per remote update, so a single linear pass is simpler. */
export function byteOffsetToUtf16(text: string, byteOffset: number): number {
  let byteLen = 0;
  let utf16Len = 0;
  for (const ch of text) {
    if (byteLen >= byteOffset) break;
    byteLen += byteEncoder.encode(ch).length;
    utf16Len += ch.length;
  }
  return utf16Len;
}
