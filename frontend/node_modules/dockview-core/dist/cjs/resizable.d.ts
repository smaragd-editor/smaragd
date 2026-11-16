import { CompositeDisposable } from './lifecycle';
export declare abstract class Resizable extends CompositeDisposable {
    private readonly _element;
    private _disableResizing;
    private _lastWidth;
    private _lastHeight;
    get element(): HTMLElement;
    get disableResizing(): boolean;
    set disableResizing(value: boolean);
    constructor(parentElement: HTMLElement, disableResizing?: boolean);
    /**
     * Lay out from the element's current size.
     *
     * The ResizeObserver above only reports asynchronously, so between
     * construction and its first callback the component believes it has no
     * size - and anything built in that window (panels added right after
     * `createDockview`, say) resolves its sizes against zero and collapses to
     * minimums. Concrete components call this once they are fully constructed
     * so that work sees the real size. The same guards as the observer apply:
     * a detached or hidden element has no size worth propagating.
     */
    protected layoutFromElement(): void;
    abstract layout(width: number, height: number): void;
}
