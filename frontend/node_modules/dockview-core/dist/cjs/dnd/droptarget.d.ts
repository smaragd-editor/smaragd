import { DockviewEvent, Event } from '../events';
import { CompositeDisposable, IDisposable } from '../lifecycle';
import { DragAndDropObserver } from './dnd';
import { Direction } from '../gridview/baseComponentGridview';
export interface DroptargetEvent {
    readonly position: Position;
    /** Narrow with `instanceof DragEvent` before reading `dataTransfer`. */
    readonly nativeEvent: DragEvent | PointerEvent;
    /**
     * The resolved cell was marked `edge` by a {@link PositionResolver}: an
     * "outer" cell that should dock against the whole layout, not this target.
     * The target renders no overlay for it; the consumer routes the commit.
     */
    readonly edge?: boolean;
}
export declare class WillShowOverlayEvent extends DockviewEvent implements DroptargetEvent {
    private readonly options;
    get nativeEvent(): DragEvent | PointerEvent;
    get position(): Position;
    /** See {@link DroptargetEvent.edge}. */
    get edge(): boolean;
    /** See {@link PositionResolverResult.edgeGroup}. A display hint; a consumer
     *  (e.g. the DnD compass) can bow out of this cell. */
    get edgeGroup(): boolean;
    constructor(options: {
        nativeEvent: DragEvent | PointerEvent;
        position: Position;
        edge?: boolean;
        edgeGroup?: boolean;
    });
}
export declare function directionToPosition(direction: Direction): Position;
export declare function positionToDirection(position: Position): Direction;
export type Position = 'top' | 'bottom' | 'left' | 'right' | 'center';
/** The pointer location within a drop target, handed to a {@link PositionResolver}. */
export interface PositionResolverArgs {
    /** Pointer X within the target element (px from its left edge). */
    readonly x: number;
    /** Pointer Y within the target element (px from its top edge). */
    readonly y: number;
    readonly width: number;
    readonly height: number;
    /** The drop zones this target currently accepts. */
    readonly zones: ReadonlySet<Position>;
    /** The originating drag event (HTML5 or pointer backend). */
    readonly event: DragEvent | PointerEvent;
}
export interface PositionResolverResult {
    readonly position: Position;
    /**
     * Marks an outer / whole-layout-edge cell. The built-in drop overlay only
     * reads `position`; consumers that route edge cells differently can read this.
     */
    readonly edge?: boolean;
    /**
     * Display hint: this cell docks as a dedicated edge group (not a grid-edge
     * split). Purely advisory. A co-installed resolver's UI (e.g. the DnD
     * compass) can suppress its own overlay for these cells so they don't
     * double-render with the edge-group affordance.
     */
    readonly edgeGroup?: boolean;
}
/**
 * Pluggable replacement for the built-in cursor-quadrant drop resolution.
 * Supplied via {@link DroptargetOptions.positionResolver}, it maps a pointer
 * location within a target to a drop {@link Position} (or `null` for no drop)
 * instead of the default threshold-band quadrant. Both DnD backends consult the
 * same resolver. When unset, the default quadrant behaviour applies unchanged.
 */
export interface PositionResolver {
    resolve(args: PositionResolverArgs): PositionResolverResult | null;
}
export type CanDisplayOverlay = (dragEvent: DragEvent | PointerEvent, state: Position) => boolean;
export type MeasuredValue = {
    value: number;
    type: 'pixels' | 'percentage';
};
export type DroptargetOverlayModel = {
    size?: MeasuredValue;
    activationSize?: MeasuredValue;
    /**
     * Override the width threshold (in pixels) below which the overlay switches
     * to a thin-border indicator instead of a half-width highlight. Set to 0 to
     * always show the half-width overlay regardless of element size.
     */
    smallWidthBoundary?: number;
    /**
     * Override the height threshold (in pixels) below which the overlay switches
     * to a thin-border indicator instead of a half-height highlight. Set to 0 to
     * always show the half-height overlay regardless of element size.
     */
    smallHeightBoundary?: number;
};
export interface DropTargetTargetModel {
    getElements(event?: DragEvent, outline?: HTMLElement): {
        root: HTMLElement;
        overlay: HTMLElement;
        changed: boolean;
    };
    exists(): boolean;
    clear(): void;
    /**
     * Clear the overlay on the next tick unless a {@link getElements} call (a
     * target rendering into this container) cancels it first. Used by the HTML5
     * backend on `dragleave`: clearing immediately would kill the overlay's
     * slide between adjacent targets, but never clearing leaves the overlay
     * behind when the drag leaves to somewhere that doesn't re-render here.
     * Optional so lightweight/mocked target models need not implement it.
     */
    scheduleClear?(): void;
}
export interface DroptargetOptions {
    canDisplayOverlay: CanDisplayOverlay;
    acceptedTargetZones: Position[];
    overlayModel?: DroptargetOverlayModel;
    getOverrideTarget?: () => DropTargetTargetModel | undefined;
    className?: string;
    getOverlayOutline?: () => HTMLElement | null;
    /**
     * Supply a {@link PositionResolver} that overrides how a pointer location
     * resolves to a drop {@link Position}. A lazy getter (like
     * {@link getOverrideTarget}) so the source can change at runtime; returning
     * `undefined` (the default) uses the built-in cursor-quadrant logic.
     */
    getPositionResolver?: () => PositionResolver | undefined;
    /**
     * Pointer backend only: skip this target during hit-testing so the ancestor
     * walk continues past it, making an element a hit-test stop for some
     * payloads and transparent for the rest. The HTML5 backend ignores it —
     * propagation there is the DOM event flow's job.
     */
    isHitTestTransparent?: () => boolean;
}
/**
 * Backend-agnostic drop target. Both the HTML5 `Droptarget` and the pointer
 * `PointerDropTarget` implement this shape so consumers can hold one field
 * regardless of which DnD backend produced it.
 */
export interface IDropTarget extends IDisposable {
    readonly onDrop: Event<DroptargetEvent>;
    readonly onWillShowOverlay: Event<WillShowOverlayEvent>;
    readonly state: Position | undefined;
    disabled: boolean;
    setTargetZones(zones: Position[]): void;
    setOverlayModel(model: DroptargetOverlayModel): void;
    /** Drop whatever this target is showing, for a consumer that commits a
     *  drop this target never sees (a capturing listener that stops the
     *  event, say) and so has to tear the overlay down itself. */
    clearOverlay(): void;
}
export declare class Droptarget extends CompositeDisposable implements IDropTarget {
    private readonly element;
    private readonly options;
    private targetElement;
    private overlayElement;
    private _state;
    /** The current state was resolved as an `edge` cell (see DroptargetEvent). */
    private _edge;
    private _acceptedTargetZonesSet;
    private readonly _onDrop;
    readonly onDrop: Event<DroptargetEvent>;
    private readonly _onWillShowOverlay;
    readonly onWillShowOverlay: Event<WillShowOverlayEvent>;
    readonly dnd: DragAndDropObserver;
    private static USED_EVENT_ID;
    private static ACTUAL_TARGET;
    private _disabled;
    get disabled(): boolean;
    set disabled(value: boolean);
    get state(): Position | undefined;
    constructor(element: HTMLElement, options: DroptargetOptions);
    setTargetZones(acceptedTargetZones: Position[]): void;
    setOverlayModel(model: DroptargetOverlayModel): void;
    dispose(): void;
    /**
     * Add a property to the event object for other potential listeners to check
     */
    private markAsUsed;
    /**
     * Check is the event has already been used by another instance of DropTarget
     */
    private isAlreadyUsed;
    private toggleClasses;
    /**
     * Resolve the drop {@link Position} for a pointer location: defer to an
     * injected {@link PositionResolver} when present, otherwise the built-in
     * cursor-quadrant logic (unchanged).
     */
    private resolvePosition;
    private calculateQuadrant;
    /**
     * Tear down whatever this target is showing, on any frame it resolves to no
     * overlay. Two things make this more than `removeDropTarget`:
     *
     * - With `dndOverlayMounting: 'absolute'` the overlay lives in an anchor
     *   container shared by every drop target in the component, and
     *   `removeDropTarget` only owns the in-place dropzone — so the container
     *   needs clearing explicitly or the last frame's highlight lingers.
     * - It must only clear the container when this target actually put
     *   something there. The root edge target sits over every group and
     *   declines `center` on each frame in the middle of the layout purely so
     *   the event falls through; clearing from there would destroy and rebuild
     *   the group's overlay every frame, killing its move transition.
     *
     * Resetting `_state` unconditionally is the other half: a target that
     * resolves to nothing must not stay latched, or a later drop commits a
     * position the cursor left long ago.
     */
    private clearOwnOverlay;
    private removeDropTarget;
    /**
     * Render the drop overlay at `position` without a live drag, so keyboard
     * docking shows the exact same preview as a mouse drag. Mirrors the
     * `onDragOver` render path (in-place or anchored). Pair with `clearOverlay`.
     */
    showOverlay(position: Position): void;
    /** Clear an overlay shown via {@link showOverlay} (in-place or anchored). */
    clearOverlay(): void;
}
export declare function calculateQuadrantAsPercentage(overlayType: Set<Position>, x: number, y: number, width: number, height: number, threshold: number): Position | null;
export declare function calculateQuadrantAsPixels(overlayType: Set<Position>, x: number, y: number, width: number, height: number, threshold: number): Position | null;
