/** @import { BaseNode, Command, Visitors } from './types.js' */
/** @import { Tokens } from './tokens.js' */
export const margin: 0;
export const newline: 1;
export const indent: 2;
export const dedent: 3;
export const space: 4;
export class Context {
    /**
     *
     * @param {Visitors} visitors
     * @param {Command[]} commands
     * @param {Tokens | null} tokens
     */
    constructor(visitors: Visitors, commands?: Command[], tokens?: Tokens | null);
    multiline: boolean;
    indent(): void;
    dedent(): void;
    margin(): void;
    newline(): void;
    space(): void;
    /**
     * @param {Context} context
     */
    append(context: Context): void;
    /**
     * Write `content`. If `node` is provided, `content` is mapped to its location. Otherwise, if `tokens`
     * were passed to `print` and `content` (ignoring surrounding whitespace) is the next token
     * in the source, it is mapped to that token's location.
     * @param {string} content
     * @param {BaseNode} [node]
     */
    write(content: string, node?: BaseNode): void;
    /**
     *
     * @param {number} line
     * @param {number} column
     */
    location(line: number, column: number): void;
    /**
     * @param {{ type: string }} node
     */
    visit(node: {
        type: string;
    }): void;
    empty(): boolean;
    measure(): number;
    "new"(): Context;
    #private;
}
import type { BaseNode } from './types.js';
import type { Visitors } from './types.js';
import type { Command } from './types.js';
import type { Tokens } from './tokens.js';
//# sourceMappingURL=context.d.ts.map