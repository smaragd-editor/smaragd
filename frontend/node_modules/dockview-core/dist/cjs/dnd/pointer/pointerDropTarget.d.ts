import { Event } from '../../events';
import { CompositeDisposable } from '../../lifecycle';
import { CanDisplayOverlay, DropTargetTargetModel, DroptargetEvent, DroptargetOverlayModel, IDropTarget, Position, PositionResolver, WillShowOverlayEvent } from '../droptarget';
export interface PointerDropTargetOptions {
    canDisplayOverlay: CanDisplayOverlay;
    acceptedTargetZones: Position[];
    overlayModel?: DroptargetOverlayModel;
    /** Render into an external anchor container (floating groups, layout root). */
    getOverrideTarget?: () => DropTargetTargetModel | undefined;
    /** Outline element for positioning; falls back to the drop element. */
    getOverlayOutline?: () => HTMLElement | null;
    className?: string;
    /**
     * Supply a {@link PositionResolver} that overrides how a pointer location
     * resolves to a drop {@link Position}. A lazy getter so the source can
     * change at runtime; `undefined` (default) uses the cursor-quadrant logic.
     */
    getPositionResolver?: () => PositionResolver | undefined;
    /** See `DroptargetOptions.isHitTestTransparent`. */
    isHitTestTransparent?: () => boolean;
}
/** Pointer-driven counterpart to `Droptarget` with identical visual output. */
export declare class PointerDropTarget extends CompositeDisposable implements IDropTarget {
    private readonly element;
    private readonly options;
    private _targetElement;
    private _overlayElement;
    private _state;
    private _edge;
    private _acceptedTargetZonesSet;
    private readonly _onDrop;
    readonly onDrop: Event<DroptargetEvent>;
    private readonly _onWillShowOverlay;
    readonly onWillShowOverlay: Event<WillShowOverlayEvent>;
    private _disabled;
    get disabled(): boolean;
    set disabled(value: boolean);
    get state(): Position | undefined;
    constructor(element: HTMLElement, options: PointerDropTargetOptions);
    clearOverlay(): void;
    setTargetZones(zones: Position[]): void;
    setOverlayModel(model: DroptargetOverlayModel): void;
    dispose(): void;
    private _onDragOver;
    private _onDragLeave;
    private _onDropEvent;
    /**
     * Resolve the drop {@link Position}: defer to an injected
     * {@link PositionResolver} when present, otherwise the built-in
     * cursor-quadrant logic (unchanged). Shares the resolver with the HTML5
     * backend.
     */
    private _resolvePosition;
    private _calculateQuadrant;
    /**
     * Tear down whatever this target is showing, on any frame it resolves to no
     * overlay. Two things make this more than `_removeOverlay`:
     *
     * - With `dndOverlayMounting: 'absolute'` the overlay lives in an anchor
     *   container shared by every drop target in the component, and
     *   `_removeOverlay` only owns the in-place dropzone — so the container
     *   needs clearing explicitly or the last frame's highlight lingers.
     * - It must only clear the container when this target actually put
     *   something there. The root edge target sits over every group and
     *   declines `center` on each frame in the middle of the layout purely so
     *   the event falls through; clearing from there would destroy and rebuild
     *   the group's overlay every frame, killing its move transition.
     */
    private _clearOwnOverlay;
    private _removeOverlay;
}
