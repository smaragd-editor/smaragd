import { Event } from '../../events';
import { CompositeDisposable, IDisposable } from '../../lifecycle';
import { PointerGhost } from './pointerGhost';
import { IPointerDropTargetHandle, PointerDragEvent } from './types';
export interface ActiveDrag {
    readonly pointerId: number;
    readonly startX: number;
    readonly startY: number;
    readonly source: HTMLElement;
}
/**
 * Only one pointer-driven drag can be active at a time.
 *
 * State is shared across every Dockview instance on the page. Targets
 * from instance B receive hit-tests from drags originating in instance A;
 * that's intentional for cross-instance drops since `LocalSelectionTransfer`
 * is also process-wide. The corollary is that every Tabs subscriber to
 * `onDragMove` fires for every pointer drag globally; each subscriber
 * hit-tests against its own DOM, so this is O(N) per pointermove where N
 * is the number of registered listeners across all instances.
 */
export declare class PointerDragController extends CompositeDisposable {
    private static _instance;
    static getInstance(): PointerDragController;
    private readonly _targets;
    /** Kept in sync with `_targets` so hit-testing is allocation-free. */
    private readonly _targetByElement;
    private _active;
    /** The most recent pointer event of the active drag, used to build the
     * drag-end event when a drag is cancelled (which carries no event). */
    private _lastPointerEvent;
    private _currentTarget;
    private _dataDisposable;
    private _ghost;
    private _moveListener;
    private _upListener;
    private _cancelListener;
    private _iframeShield;
    private _selectionShield;
    private _onDragMoveCallback?;
    private _onDragEndCallback?;
    private readonly _onDragStart;
    readonly onDragStart: Event<PointerDragEvent>;
    private readonly _onDragMove;
    readonly onDragMove: Event<PointerDragEvent>;
    private readonly _onDragEnd;
    readonly onDragEnd: Event<PointerDragEvent>;
    private constructor();
    get active(): ActiveDrag | undefined;
    registerTarget(target: IPointerDropTargetHandle): IDisposable;
    beginDrag(args: {
        pointerEvent: PointerEvent;
        source: HTMLElement;
        getData: () => IDisposable;
        ghost?: PointerGhost;
        onDragMove?: (e: PointerDragEvent) => void;
        onDragEnd?: (e: PointerDragEvent, dropped: boolean) => void;
    }): void;
    cancel(): void;
    private _findTargetUnder;
    private _handleMove;
    private _handleEnd;
    private _teardown;
}
