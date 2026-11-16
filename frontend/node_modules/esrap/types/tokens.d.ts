/**
 * Tracks which of the parser's tokens have been written, so that `context.write`
 * can map a token to its source location. Each `context.visit` narrows the search to
 * the tokens inside the visited node; each written token advances the cursor past it.
 */
export class Tokens {
    /** @param {readonly Token[]} tokens */
    constructor(tokens: readonly Token[]);
    /**
     * Bound the search to the tokens within `node`. If `node` has no location, disable
     * searching until a descendant with a location is visited
     * @param {BaseNode} node
     * @returns {Frame} the previous state, to be passed to `exit`
     */
    enter(node: BaseNode): Frame;
    /**
     * Restore the state from before `enter`, advancing the cursor past `node`
     * @param {BaseNode} node
     * @param {Frame} previous
     */
    exit(node: BaseNode, previous: Frame): void;
    /**
     * Advance the cursor past `position`
     * @param {Position} position
     */
    skip(position: Position): void;
    /**
     * If `value` is the next unwritten token, consume it and return it. A closing
     * bracket matches the partner of the opening bracket that was last written
     * @param {string} value
     * @param {Position} [from] only match tokens starting at or after this position
     * @param {Position} [to] only match tokens ending at or before this position
     * @returns {Entry | undefined}
     */
    consume(value: string, from?: Position, to?: Position): Entry | undefined;
    #private;
}
export type Position = {
    line: number;
    column: number;
};
export type Entry = {
    value: string;
    start: Position;
    end: Position;
    pair: number;
};
export type Frame = {
    lo: number;
    hi: number;
    openers: Opener[];
};
export type Opener = {
    value: string;
    pair: number;
};
import type { BaseNode } from './types.js';
import type { Token } from './types.js';
//# sourceMappingURL=tokens.d.ts.map