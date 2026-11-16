import { IDisposable } from '../../lifecycle';
export interface PointerGhostOptions {
    element: HTMLElement;
    initialX: number;
    initialY: number;
    /** Pointer position within the ghost; default top-left. */
    offsetX?: number;
    offsetY?: number;
    /** Default 0.8. */
    opacity?: number;
    /**
     * Source element whose document body (or shadow root, when it lives in
     * one) hosts the ghost. Pass it for popout-window drags so the ghost
     * renders in the popout's document.
     */
    owner?: Element;
}
/**
 * Floating clone that follows the pointer; appended to the owning
 * document's body with `pointer-events: none` so it doesn't intercept
 * hit-testing.
 */
export declare class PointerGhost implements IDisposable {
    private readonly element;
    /** What is positioned and attached: `element`, or a top-layer wrapper
     *  around it when the ghost lives in a shadow root. */
    private readonly container;
    private readonly offsetX;
    private readonly offsetY;
    private _disposed;
    constructor(opts: PointerGhostOptions);
    update(clientX: number, clientY: number): void;
    dispose(): void;
}
