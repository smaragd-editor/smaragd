import { IView, Orientation, Sizing, LayoutPriority, ISplitviewStyles } from '../splitview/splitview';
import { Event } from '../events';
import { INodeDescriptor } from './gridview';
import { Node } from './types';
import { CompositeDisposable } from '../lifecycle';
export declare class BranchNode extends CompositeDisposable implements IView {
    readonly orientation: Orientation;
    readonly styles: ISplitviewStyles | undefined;
    readonly element: HTMLElement;
    private readonly splitview;
    private _orthogonalSize;
    private _size;
    private _childrenDisposable;
    readonly children: Node[];
    /**
     * `minimumSize`/`maximumSize`/`priority` are aggregates over all children,
     * read repeatedly per frame inside `Splitview.resize` / `layoutViews`.
     * Because a grid is splitviews-of-splitviews, recomputing them on every
     * getter access (with array allocations) would make a sash drag O(children²)
     * with per-read allocation. These values only change on a structural
     * mutation, a visibility toggle, or a child's own constraints changing (which
     * surfaces as the child's `onDidChange`) — none of which fire during a plain
     * sash drag — so we cache them and invalidate on exactly those signals.
     * `undefined` means "dirty; recompute on read".
     */
    private _cachedMinimumSize;
    private _cachedMaximumSize;
    private _cachedPriority;
    private readonly _onDidChange;
    readonly onDidChange: Event<{
        size?: number;
        orthogonalSize?: number;
    }>;
    private readonly _onDidVisibilityChange;
    readonly onDidVisibilityChange: Event<{
        visible: boolean;
    }>;
    get width(): number;
    get height(): number;
    get minimumSize(): number;
    get maximumSize(): number;
    get minimumOrthogonalSize(): number;
    get maximumOrthogonalSize(): number;
    get orthogonalSize(): number;
    get size(): number;
    get minimumWidth(): number;
    get minimumHeight(): number;
    get maximumWidth(): number;
    get maximumHeight(): number;
    get priority(): LayoutPriority;
    private computePriority;
    private invalidateCachedSizes;
    get disabled(): boolean;
    set disabled(value: boolean);
    get margin(): number;
    set margin(value: number);
    get proportionalLayout(): boolean;
    set proportionalLayout(value: boolean);
    constructor(orientation: Orientation, proportionalLayout: boolean, styles: ISplitviewStyles | undefined, size: number, orthogonalSize: number, disabled: boolean, margin: number | undefined, childDescriptors?: INodeDescriptor[]);
    setVisible(_visible: boolean): void;
    isChildVisible(index: number): boolean;
    setChildVisible(index: number, visible: boolean): void;
    moveChild(from: number, to: number): void;
    getChildSize(index: number): number;
    resizeChild(index: number, size: number): void;
    layout(size: number, orthogonalSize: number): void;
    addChild(node: Node, size: number | Sizing, index: number, skipLayout?: boolean): void;
    getChildCachedVisibleSize(index: number): number | undefined;
    removeChild(index: number, sizing?: Sizing): Node;
    private _addChild;
    private _removeChild;
    private setupChildrenEvents;
    dispose(): void;
}
