import { Event } from '../events';
import { CompositeDisposable } from '../lifecycle';
import { AnchoredBox, Box, DragModifiers } from '../types';
/**
 * Context handed to {@link OverlayOptions.transformDragPosition} each
 * pointer-move frame while a floating overlay is being dragged.
 */
export interface OverlayDragContext {
    /** Proposed top-left + size this frame, in container pixels (pre-clamp). */
    readonly proposed: Box;
    /** Size of the container the overlay is dragged within. */
    readonly container: {
        width: number;
        height: number;
    };
    /** Bounds of the sibling overlays, snapshotted at drag start. */
    readonly others: readonly Box[];
    /** Modifier-key state from this frame's pointer event. */
    readonly modifiers: DragModifiers;
}
export declare class Overlay extends CompositeDisposable {
    private readonly options;
    private readonly _element;
    private readonly _onDidChange;
    readonly onDidChange: Event<void>;
    private readonly _onDidChangeEnd;
    readonly onDidChangeEnd: Event<void>;
    private readonly _onDidStartMoving;
    /** Fires once per drag, the first time the float actually moves. */
    readonly onDidStartMoving: Event<void>;
    private readonly _dragMove;
    private _dragCancelled;
    private static readonly MINIMUM_HEIGHT;
    private static readonly MINIMUM_WIDTH;
    private verticalAlignment;
    private horiziontalAlignment;
    private _isVisible;
    set minimumInViewportWidth(value: number | undefined);
    set minimumInViewportHeight(value: number | undefined);
    get element(): HTMLElement;
    get isVisible(): boolean;
    /**
     * Height of the optional drag-handle header, or 0 when none is present.
     * Used to translate between the overlay's outer box and the content area
     * available to the group beneath the header.
     */
    get headerHeight(): number;
    constructor(options: AnchoredBox & {
        container: HTMLElement;
        content: HTMLElement;
        /**
         * Optional dedicated drag handle rendered above the content (a
         * floating window title bar). When provided the resize container
         * lays its children out as a flex column so the content shrinks
         * to fit beneath the handle.
         */
        header?: HTMLElement;
        minimumInViewportWidth?: number;
        minimumInViewportHeight?: number;
        /**
         * Adjust the proposed top-left each drag frame (before the
         * container clamp). Return an adjusted position or nothing to leave
         * it unchanged. Used to implement snapping / custom bounds.
         */
        transformDragPosition?: (context: OverlayDragContext) => {
            top: number;
            left: number;
        } | void;
        /**
         * Snapshot the sibling overlays' boxes at drag start, supplied to
         * `transformDragPosition` as `context.others`.
         */
        getSiblingBoxes?: () => readonly Box[];
    });
    setVisible(isVisible: boolean): void;
    bringToFront(): void;
    setBounds(bounds?: Partial<AnchoredBox>): void;
    toJSON(): AnchoredBox;
    /**
     * Abort an in-flight move-the-float drag. Used by the void container
     * when a redock long-press fires after the move started, so the ghost
     * gesture wins without the float continuing to follow the finger.
     * Does not emit `onDidChangeEnd` because no change is being committed.
     */
    cancelPendingDrag(): void;
    setupDrag(dragTarget: HTMLElement, options?: {
        inDragMode?: boolean;
    }): void;
    private setupResize;
    private getMinimumWidth;
    private getMinimumHeight;
    dispose(): void;
}
