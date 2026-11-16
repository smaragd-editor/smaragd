import type { BaseNode } from '../types.js';
export type TSOptions = {
    quotes?: 'double' | 'single';
    comments?: Comment[];
    getLeadingComments?: (node: BaseNode) => BaseComment[] | undefined;
    getTrailingComments?: (node: BaseNode) => BaseComment[] | undefined;
};
interface Position {
    line: number;
    column: number;
}
export interface BaseComment {
    type: 'Line' | 'Block';
    value: string;
    start?: number;
    end?: number;
}
export interface Comment extends BaseComment {
    loc: {
        start: Position;
        end: Position;
    };
}
export {};
//# sourceMappingURL=types.d.ts.map