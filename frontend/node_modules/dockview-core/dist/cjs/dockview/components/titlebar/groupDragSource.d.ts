import { DockviewComponent } from '../../dockviewComponent';
import { CompositeDisposable } from '../../../lifecycle';
import { DockviewGroupPanel } from '../../dockviewGroupPanel';
declare const FLOATING_REDOCK_INITIATION_DELAY_MS = 500;
export interface GroupDragSourceOptions {
    readonly element: HTMLElement;
    readonly accessor: DockviewComponent;
    /**
     * The group this handle drags. Pass a function when the handle outlives the
     * group it represents and can be retargeted, e.g. a floating window's
     * dedicated title bar, whose anchor group is reassigned when the original
     * anchor leaves a multi-group window. A fixed reference (the tab-bar void
     * container, which lives inside its own group's DOM) is also accepted.
     */
    readonly group: DockviewGroupPanel | (() => DockviewGroupPanel);
    /**
     * Whether this element is the floating window's move handle. Only the move
     * handle needs the floating disambiguation (shift for mouse / long-press
     * for touch) that keeps the redock gesture from firing alongside the
     * move-the-float gesture. Other handles on a floating group (e.g. the tab
     * bar's void container when a dedicated title bar is the move handle) drag
     * to redock with a plain drag, exactly like a group in the main grid.
     * Defaults to `() => true`.
     */
    readonly isFloatingMoveHandle?: () => boolean;
}
/**
 * The drag-source half of a group drag handle: html5 + pointer drag sources
 * that publish a group-level `PanelTransfer`, the "Multiple Panels (N)" ghost,
 * and the floating-group disambiguation that keeps the redock gesture from
 * firing alongside the overlay's move-the-float gesture.
 *
 * Shared by the tab-bar void container and the dedicated floating title bar so
 * both grab handles redock identically.
 */
export declare class GroupDragSource extends CompositeDisposable {
    private readonly _element;
    private readonly accessor;
    private readonly groupAccessor;
    private readonly html5DragSource;
    private readonly pointerDragSource;
    private readonly panelTransfer;
    private readonly _onDragStart;
    readonly onDragStart: import("../../../events").Event<PointerEvent | DragEvent>;
    private readonly isFloatingMoveHandle;
    private get group();
    constructor(options: GroupDragSourceOptions);
    updateDragAndDropState(): void;
    private getFloatingOverlay;
}
export { FLOATING_REDOCK_INITIATION_DELAY_MS };
