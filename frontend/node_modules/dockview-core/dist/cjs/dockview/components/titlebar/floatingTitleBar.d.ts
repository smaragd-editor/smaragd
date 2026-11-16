import { DockviewComponent } from '../../dockviewComponent';
import { CompositeDisposable } from '../../../lifecycle';
import { DockviewGroupPanel } from '../../dockviewGroupPanel';
/**
 * A dedicated, blank drag handle rendered above a floating group's tab bar.
 *
 * It plays the same dual role the tab-bar void container plays today: a plain
 * pointer-drag moves the floating window (wired by the overlay via
 * `setupDrag`), while a shift+drag (mouse) or long-press (touch) detaches the
 * group to redock it into the grid. The redock half is provided by the shared
 * {@link GroupDragSource}; the move half is owned by the overlay.
 *
 * The bar is intentionally contentless; styling is driven entirely through
 * the `--dv-floating-titlebar-*` theme variables.
 */
export declare class FloatingTitleBar extends CompositeDisposable {
    private readonly accessor;
    private readonly _element;
    private readonly dragSource;
    private _group;
    private readonly _onDragStart;
    readonly onDragStart: import("../../../events").Event<PointerEvent | DragEvent>;
    get element(): HTMLElement;
    /** The window's current anchor group, the one this bar drags/activates. */
    get group(): DockviewGroupPanel;
    /**
     * Retarget the bar at a new anchor group. Called when the original anchor
     * leaves a multi-group floating window and another member is promoted, so
     * the bar keeps activating/redocking a group that actually lives here.
     */
    setGroup(group: DockviewGroupPanel): void;
    constructor(accessor: DockviewComponent, group: DockviewGroupPanel);
    updateDragAndDropState(): void;
}
