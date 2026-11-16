import { CompositeDisposable } from '../../lifecycle';
export interface LongPressOptions {
    /** Default 500ms. */
    delay?: number;
    /** Default 8px. */
    tolerance?: number;
    /** Default true: mouse users have right-click and don't need this. */
    touchOnly?: boolean;
    /** Receives the `pointerdown` event so consumers can read `clientX/Y`. */
    onLongPress: (event: PointerEvent) => void;
}
/**
 * Doesn't consume the pointer; movement past `tolerance` cancels
 * silently so a sibling `PointerDragSource` can take over.
 */
export declare class LongPressDetector extends CompositeDisposable {
    private readonly element;
    private readonly options;
    private _pointerId;
    private _startX;
    private _startY;
    private _timer;
    private _moveListener;
    private _upListener;
    private _cancelListener;
    constructor(element: HTMLElement, options: LongPressOptions);
    private _onPointerDown;
    private _installContextMenuGuard;
    private _installClickGuard;
    private _cancelPending;
    dispose(): void;
}
