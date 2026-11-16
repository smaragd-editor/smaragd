import { IDisposable } from '../lifecycle';
import { DroptargetOptions, IDropTarget } from './droptarget';
/**
 * Backend factory surface. Each implementation hides one concrete DnD
 * mechanism (HTML5 native events, pointer events) behind a uniform set of
 * `createX` methods.
 *
 * The backends are stateless. `html5Backend` and `pointerBackend` below
 * are exported as module-level singletons, so they need no construction
 * or wiring through the component tree.
 */
export interface IDragBackend {
    /** Stable identifier, mostly for debugging / tests. */
    readonly kind: 'html5' | 'pointer';
    createDropTarget(element: HTMLElement, options: DroptargetOptions): IDropTarget;
    createDragSource(element: HTMLElement, options: DragSourceOptions): IDragSource;
}
/**
 * Visual specification handed to the backend. HTML5 calls `setDragImage`
 * with `(element, offsetX, offsetY)` and discards the element after a
 * microtask. Pointer wraps the element in a `PointerGhost` that follows
 * the cursor for the duration of the drag.
 */
export interface IDragGhostSpec {
    element: HTMLElement;
    /** Pixels from cursor to ghost's top-left. Default 0. */
    offsetX?: number;
    offsetY?: number;
    /**
     * Called when the backend is done with the ghost. HTML5 fires it after
     * the drag-image snapshot is captured (next tick); pointer fires it
     * when the follow-cursor ghost is removed at drag end. Use for custom
     * framework renderers that need teardown.
     */
    dispose?: () => void;
}
export interface DragSourceOptions {
    /** Populate transfer; returned disposer clears it on drag end. */
    getData: (event: DragEvent | PointerEvent) => IDisposable;
    /** Veto a drag at start time. */
    isCancelled?: (event: DragEvent | PointerEvent) => boolean;
    createGhost?: (event: DragEvent | PointerEvent) => IDragGhostSpec | undefined;
    onDragStart?: (event: DragEvent | PointerEvent) => void;
    onDragEnd?: (event: DragEvent | PointerEvent) => void;
    /** Initial disabled state; toggle later via `setDisabled`. */
    disabled?: boolean;
    /**
     * Pointer-only. When true (default), the pointer backend ignores mouse
     * pointers and lets the HTML5 path handle them. HTML5 backend ignores.
     */
    touchOnly?: boolean;
    /**
     * Pointer-only long-press delay in ms. May be a function so the value
     * can vary per gesture (e.g. floating-group redock vs docked rearrange).
     */
    touchInitiationDelay?: number | (() => number);
    /** Pointer-only pre-arm movement tolerance in px. May also be a function. */
    pressTolerance?: number | (() => number);
    /** Pointer-only movement threshold to promote pointerdown → drag. */
    threshold?: number;
}
export interface IDragSource extends IDisposable {
    setDisabled(value: boolean): void;
    /** Pointer-only knob; no-op on HTML5 backend. */
    setTouchOnly(value: boolean): void;
    /** Pointer-only; no-op on HTML5 backend. */
    cancelPending(): void;
}
export declare const html5Backend: IDragBackend;
export declare const pointerBackend: IDragBackend;
