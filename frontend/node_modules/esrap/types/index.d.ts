/**
 * @template {BaseNode} [T=BaseNode]
 * @param {T} node
 * @param {Visitors<T>} visitors
 * @param {PrintOptions} opts
 * @returns {{ code: string, map: any }} // TODO
 */
export function print<T extends BaseNode = BaseNode>(node: T, visitors: Visitors<T>, opts?: PrintOptions): {
    code: string;
    map: any;
};
export { Context };
import type { BaseNode } from './types.js';
import type { Visitors } from './types.js';
import type { PrintOptions } from './types.js';
import { Context } from './context.js';
//# sourceMappingURL=index.d.ts.map