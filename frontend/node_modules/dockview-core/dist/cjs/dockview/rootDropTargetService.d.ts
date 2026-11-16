import { IDisposable } from '../lifecycle';
import { Event } from '../events';
import { DroptargetEvent, DropTargetTargetModel, Position, WillShowOverlayEvent } from '../dnd/droptarget';
import { DockviewComponentOptions } from './options';
export interface IRootDropTargetHost {
    readonly id: string;
    readonly element: HTMLElement;
    readonly options: DockviewComponentOptions;
    /**
     * Whether the two-band edge drag-reveal affordance is registered.
     *
     * Read lazily, never at construction: module services are created in
     * registration order, and this one is built before any module that could
     * provide the affordance, so at construction the answer is always `false`,
     * even when the affordance is on its way. The module's `init` hook
     * re-applies the options once every service exists.
     */
    readonly hasEdgeDragReveal: boolean;
    isGridEmpty(): boolean;
    rootDropTargetOverrideTarget(): DropTargetTargetModel | undefined;
    /**
     * Build, fire, and return the verdict for an unhandled-drag-over event.
     * Implemented on the component side so the service stays free of
     * circular imports with the event class declared in dockviewComponent.
     */
    dispatchUnhandledDragOver(nativeEvent: DragEvent | PointerEvent, position: Position): boolean;
}
export interface IRootDropTargetService extends IDisposable {
    /** Merged stream from both DnD backends. */
    readonly onWillShowOverlay: Event<WillShowOverlayEvent>;
    /** Merged stream from both DnD backends. */
    readonly onDrop: Event<DroptargetEvent>;
    /** Apply changed options (dndEdges). */
    setOptions(options: Partial<DockviewComponentOptions>): void;
}
export declare class RootDropTargetService implements IRootDropTargetService {
    private readonly _html5Target;
    private readonly _pointerTarget;
    private readonly _host;
    readonly onWillShowOverlay: Event<WillShowOverlayEvent>;
    readonly onDrop: Event<DroptargetEvent>;
    constructor(host: IRootDropTargetHost);
    setOptions(options: Partial<DockviewComponentOptions>): void;
    dispose(): void;
}
export declare const RootDropTargetModule: import("./modules").DockviewModule<IRootDropTargetHost>;
