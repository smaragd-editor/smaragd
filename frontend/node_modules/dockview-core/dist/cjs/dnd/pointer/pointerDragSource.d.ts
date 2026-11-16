import { CompositeDisposable, IDisposable } from '../../lifecycle';
import { PointerGhost } from './pointerGhost';
import { PointerDragEvent } from './types';
export interface PointerDragSourceOptions {
    /** Populate transfer data; returned disposer clears it on drag end. */
    getData: (event: PointerEvent) => IDisposable;
    onDragStart?: (event: PointerEvent) => void;
    onDragMove?: (event: PointerDragEvent) => void;
    onDragEnd?: (event: PointerDragEvent, dropped: boolean) => void;
    /** Cancels the drag at pointerdown time. */
    isCancelled?: (event: PointerEvent) => boolean;
    /** Default 5px. Touch pointers also need `touchInitiationDelay` to elapse. */
    threshold?: number;
    /**
     * Touch-only long-press; movement past `pressTolerance` during the delay
     * still arms the drag (any flick is drag intent). Default 250ms. May be
     * a function so callers can vary it per gesture (e.g. require a longer
     * hold for floating-group redock vs docked-group rearrange).
     */
    touchInitiationDelay?: number | (() => number);
    /** Default 8px. May be a function; see `touchInitiationDelay`. */
    pressTolerance?: number | (() => number);
    /** Default true: mouse defers to HTML5; pointer path handles touch / pen only. */
    touchOnly?: boolean;
    /** Follow-finger ghost factory; if omitted the user only sees drop overlays. */
    createGhost?: (event: PointerEvent) => PointerGhost | undefined;
}
/**
 * Pointer-event drag source. Waits for movement past `threshold` (and
 * touch-only `touchInitiationDelay`) before promoting to a drag so taps
 * pass through unaffected.
 */
export declare class PointerDragSource extends CompositeDisposable {
    private readonly element;
    private readonly options;
    private _disabled;
    private _touchOnly;
    private _pendingPointerId;
    private _pendingMoveListener;
    private _pendingUpListener;
    private _pendingCancelListener;
    private _armTimer;
    private _selectionShield;
    private _armed;
    private _startX;
    private _startY;
    private _startEvent;
    constructor(element: HTMLElement, options: PointerDragSourceOptions);
    setDisabled(value: boolean): void;
    /**
     * `false` lets the pointer source also handle mouse pointers; used when
     * `dndStrategy: 'pointer'` to drive every input type through this path.
     */
    setTouchOnly(value: boolean): void;
    private _shouldHandle;
    private _onPointerDown;
    /** For sibling gesture detectors (e.g. LongPressDetector) to dismiss a pending drag. */
    cancelPending(): void;
    private _cancelPending;
    private _beginDrag;
    dispose(): void;
}
