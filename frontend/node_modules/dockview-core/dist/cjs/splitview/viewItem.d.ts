import { IDisposable } from '../lifecycle';
import { IView, LayoutPriority } from './splitview';
export declare class ViewItem {
    container: HTMLElement;
    view: IView;
    private readonly disposable;
    private _size;
    private _cachedVisibleSize;
    /**
     * The geometry styles last written to `container` by `layoutViews`. Sizes
     * are re-applied on every layout/resize frame, but for the many views that
     * didn't move on a given frame the value is identical to last time; writing
     * an unchanged inline style still dirties the element for style recalc, so
     * we diff against these and skip the no-op writes. `layoutViews` is the only
     * writer of these four properties (verified), so the cache cannot drift.
     */
    private readonly _appliedStyles;
    set size(size: number);
    setContainerGeometry(prop: 'width' | 'height' | 'top' | 'left', value: string): void;
    get size(): number;
    get cachedVisibleSize(): number | undefined;
    get visible(): boolean;
    get minimumSize(): number;
    get viewMinimumSize(): number;
    get maximumSize(): number;
    get viewMaximumSize(): number;
    get priority(): LayoutPriority | undefined;
    get snap(): boolean;
    set enabled(enabled: boolean);
    constructor(container: HTMLElement, view: IView, size: number | {
        cachedVisibleSize: number;
    }, disposable: IDisposable);
    setVisible(visible: boolean, size?: number): void;
    dispose(): IView;
}
