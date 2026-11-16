import { IDragSource } from '../../../dnd/backend';
import { IDisposable, IValueDisposable } from '../../../lifecycle';
import { DockviewComponent } from '../../dockviewComponent';
import { DockviewGroupPanel } from '../../dockviewGroupPanel';
import { DockviewHeaderDirection } from '../../options';
import { Tab } from '../tab/tab';
import { ITabGroup } from '../../tabGroup';
import { ITabGroupChipRenderer } from '../../framework';
import { DroptargetEvent, IDropTarget } from '../../../dnd/droptarget';
export interface TabGroupManagerContext {
    readonly group: DockviewGroupPanel;
    readonly accessor: DockviewComponent;
    readonly tabsList: HTMLElement;
    getTabs(): IValueDisposable<Tab>[];
    getTabMap(): Map<string, IValueDisposable<Tab>>;
    getDirection(): DockviewHeaderDirection;
}
export interface TabGroupManagerCallbacks {
    onChipContextMenu(tabGroup: ITabGroup, event: MouseEvent): void;
    onChipDragStart(tabGroup: ITabGroup, chip: ITabGroupChipRenderer, event: DragEvent | PointerEvent): void;
    /**
     * HTML5 chip dragend only. Pointer dragend is handled centrally via
     * `PointerDragController.onDragEnd` in `tabs.ts`.
     */
    onChipDragEnd?(tabGroup: ITabGroup, chip: ITabGroupChipRenderer, event: DragEvent | PointerEvent): void;
    onChipDrop(tabGroup: ITabGroup, event: DroptargetEvent): void;
}
interface ChipRendererEntry {
    chip: ITabGroupChipRenderer;
    /**
     * Created by the manager so it can be toggled live on strategy changes.
     * Undefined between an in-flight drag being torn down by
     * `disposeChipDrag` and the following `update()` re-arming it — the chip
     * element outlives a within-group move even though its drag sources do
     * not. (#1410)
     */
    html5DragSource: IDragSource | undefined;
    pointerDragSource: IDragSource | undefined;
    /** Disposes the two drag sources + their shared dragend listener. */
    dragSourcesDisposable: IDisposable | undefined;
    disposable: IDisposable;
    dropTarget: IDropTarget;
    pointerDropTarget: IDropTarget;
}
export declare class TabGroupManager {
    private readonly _ctx;
    private readonly _callbacks;
    private readonly _chipRenderers;
    private _indicator;
    private _skipNextCollapseAnimation;
    private readonly _pendingTransitionCleanups;
    get chipRenderers(): ReadonlyMap<string, ChipRendererEntry>;
    get groupUnderlines(): ReadonlyMap<string, HTMLElement>;
    get skipNextCollapseAnimation(): boolean;
    set skipNextCollapseAnimation(value: boolean);
    constructor(_ctx: TabGroupManagerContext, _callbacks: TabGroupManagerCallbacks);
    /**
     * Synchronize chip elements and CSS classes for all tab groups
     * in the parent group model. Call after any tab group mutation.
     */
    update(): void;
    /**
     * Re-read the active palette and re-apply colors to chips, tabs and
     * the indicator. Called when `tabGroupColors` / `tabGroupAccent`
     * options change at runtime.
     */
    refreshAccents(): void;
    positionAllChips(): void;
    updateDirection(): void;
    /**
     * Drop any overlay the chips are showing. A group move is committed by a
     * capturing listener on the tabs list that stops the event, so the chip
     * target under the cursor never sees the drop that would clear its own.
     */
    clearChipDropOverlays(): void;
    /** Each chip's extent along the strip's main axis: width for a horizontal
     *  header, height for a vertical one. */
    snapshotChipSizes(): Map<string, number>;
    positionUnderlines(): void;
    trackUnderlines(): void;
    setGroupDragImage(event: DragEvent, tabGroup: ITabGroup, chipEl: HTMLElement): void;
    cleanupTransition(panelId: string): void;
    updateDragAndDropState(): void;
    /**
     * Synchronously dispose the chip drag sources for an in-flight chip
     * drag. Called from `_commitGroupMove` so the transfer payload +
     * iframe shield are released before the cross-group move detaches
     * the chip (chip dispose is scheduled on a microtask via
     * `_scheduleTabGroupUpdate`, which is too late for callers that read
     * `getPanelData()` synchronously after the move).
     *
     * A cross-group move dissolves the source chip entirely, but a
     * within-group reorder keeps the same chip element — so the sources are
     * cleared to `undefined` here and the subsequent `update()` re-arms them
     * via `_ensureChipForGroup`. Without that re-arm the chip would fire a
     * native `dragstart` (the element keeps `draggable=true`) but never set
     * a transfer payload, leaving the group permanently undraggable after
     * its first move. (#1410)
     */
    disposeChipDrag(tabGroupId: string): void;
    /** Cloned chip rect used as the pointer follow-finger ghost. */
    private _buildChipGhostElement;
    disposeAll(): void;
    private _ensureIndicator;
    /**
     * Create the HTML5 + pointer drag sources for a chip (and the direct
     * dragend listener that clears the transfer synchronously). Extracted so
     * both the initial chip build and the post-move re-arm in
     * `_ensureChipForGroup` share one wiring path. (#1410)
     */
    private _createChipDragSources;
    private _ensureChipForGroup;
    private _positionChipForGroup;
    private _updateTabGroupClasses;
}
export {};
