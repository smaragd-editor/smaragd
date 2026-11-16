import { CompositeDisposable, IValueDisposable } from '../../../lifecycle';
import { DockviewComponent } from '../../dockviewComponent';
import { DockviewGroupPanel } from '../../dockviewGroupPanel';
import { DockviewHeaderDirection } from '../../options';
import { Tab } from '../tab/tab';
import { TabDropIndexEvent } from './tabsContainer';
import { TabGroupManager } from './tabGroups';
export interface TabAnimationState {
    sourceTabId: string;
    sourceIndex: number;
    tabPositions: Map<string, DOMRect>;
    /** Group-chip main-axis sizes keyed by group ID, captured before collapse */
    chipSizes: Map<string, number>;
    currentInsertionIndex: number | null;
    targetTabGroupId: string | null;
    /** When set, the drag source is a group chip (entire group drag) */
    sourceTabGroupId: string | null;
    /** Cached panel IDs of the source group (avoids repeated lookups during drag) */
    sourceGroupPanelIds: Set<string> | null;
    /** Main-axis size of the group chip, captured before collapse */
    sourceChipSize: number;
    /** Distance from the cursor to the leading edge of the drag image */
    cursorOffsetFromDragStart: number;
    /** Total main-axis size of the dragged content (chip + tabs for groups,
     *  the tab's own size for singles) */
    sourceGapSize: number;
    /** Leading edge of the tabs container at drag start */
    containerStart: number;
}
/**
 * Main-axis extent of a rect. Tabs flow along x in a horizontal header
 * (top/bottom) and along y in a vertical one (the left/right edge groups),
 * so the reorder math reads every size through this.
 */
export declare function mainAxisSize(rect: {
    width: number;
    height: number;
}, direction: DockviewHeaderDirection): number;
/** Leading edge of a rect along the main axis. */
export declare function mainAxisStart(rect: {
    left: number;
    top: number;
}, direction: DockviewHeaderDirection): number;
/** A cursor position projected onto the main axis. */
export declare function mainAxisCursor(event: {
    clientX: number;
    clientY: number;
}, direction: DockviewHeaderDirection): number;
export interface ITabReorderHost {
    /** Live tab list (the `_tabs` array of the owning `Tabs`). */
    readonly tabItems: IValueDisposable<Tab>[];
    /** Panel-id → tab lookup (the `_tabMap` of the owning `Tabs`). */
    readonly tabMap: Map<string, IValueDisposable<Tab>>;
    /** The scrollable tab strip element (`.dv-tabs-container`). */
    readonly tabsList: HTMLElement;
    readonly direction: DockviewHeaderDirection;
    readonly groupPanel: DockviewGroupPanel;
    readonly component: DockviewComponent;
    readonly tabGroupManager: TabGroupManager;
    /** Fire the owning `Tabs`' drop event. */
    fireDrop(event: TabDropIndexEvent): void;
}
/**
 * Tab drag-reorder + FLIP animation subsystem extracted from `Tabs`. The DOM
 * event wiring remains in `Tabs` and delegates the reorder/animation logic to
 * this controller. All access back into `Tabs` goes through
 * {@link ITabReorderHost}.
 */
export declare class TabReorderController extends CompositeDisposable {
    private readonly host;
    private _animState;
    private readonly _pendingMarginCleanups;
    private _pendingCollapse;
    private _flipTransitionCleanup;
    private _voidContainer;
    private _extendedDropZone;
    private _pointerInsideTabsList;
    /** The tab element currently carrying a wrap-mode drop indicator, if any. */
    private _wrapIndicatorEl;
    private get _tabs();
    private get _tabMap();
    private get _tabsList();
    private get _direction();
    private get group();
    private get accessor();
    private get _tabGroupManager();
    /** Whether the tab strip is in multi-row wrap layout
     *  (`MultiRowTabsModule`, `overflow.mode: 'wrap'`). In wrap, the 1-D
     *  gap/FLIP animation is suppressed and reorder uses a 2-D hit-test. */
    private get _wrapMode();
    get animState(): TabAnimationState | null;
    set animState(value: TabAnimationState | null);
    get pendingCollapse(): boolean;
    set pendingCollapse(value: boolean);
    set voidContainerElement(el: HTMLElement | null);
    constructor(host: ITabReorderHost);
    setExtendedDropZone(el: HTMLElement): void;
    /**
     * Allows external elements (e.g. void container, left actions) to push an
     * insertion index into the animation while the cursor is outside the tabs
     * list itself.  Pass `null` to clear the indicator.
     */
    setExternalInsertionIndex(index: number | null): void;
    /**
     * Called when the drag cursor leaves the entire header area (not just the
     * tabs list).  Clears animation state for cross-group drags, which never
     * receive a `dragend` event on this tab list.
     */
    clearExternalAnimState(): void;
    snapshotTabPositions(): Map<string, DOMRect>;
    /** Main-axis extent of a rect for this header's orientation. */
    private _mainAxisSize;
    /** Main-axis leading edge of a rect for this header's orientation. */
    private _mainAxisStart;
    /** The cursor coordinate along the main axis. */
    private _mainAxisCoord;
    /** The margin that opens the insertion gap. It must run along the main
     *  axis, so a vertical header pushes tabs down rather than sideways. */
    private get _gapMarginProperty();
    private getAverageTabSize;
    /**
     * Pointer-event entry point. The HTML5 path enters via the per-element
     * `dragover` listener; this one hit-tests the global pointer-drag
     * position against the tabs list and routes through the same shared
     * `processDragOver` / `processDragLeave` helpers.
     */
    handlePointerDragMove(clientX: number, clientY: number): void;
    /**
     * Pointer-side cleanup hook: when any pointer drag ends, reset the
     * inside-strip flag and tear down any smooth-reorder anim state the
     * dragover bridge may have installed.
     */
    handlePointerDragEnd(e?: {
        clientX: number;
        clientY: number;
        pointerEvent: PointerEvent;
    }): void;
    private isPointInsideTabsList;
    /** Commit a smooth-mode intra-group reorder from the current insertion
     *  index (adjusted for the source's own position), then clear drag state.
     *  Used by the pointer backend for both single-row and wrap layouts. */
    private commitPointerReorder;
    /**
     * Shared body of the dragover entry point. Refreshes stale anim state
     * for a changed drag identity, initializes anim state for incoming
     * cross-group drags, and dispatches to the gap-following math in
     * `handleDragOver`. Returns true when this tabs list has taken
     * ownership of the drag; HTML5 callers use this to gate
     * `event.preventDefault()`.
     */
    processDragOver(clientX: number, clientY?: number): boolean;
    /**
     * If a previous drag's anim state lingers but the current drag is a
     * different cross-group chip identity, drop the stale state so the new drag
     * starts clean.
     */
    private _dropStaleAnimState;
    /**
     * Create the anim state for an external (cross-group) tab or chip drag.
     * Returns `true` when state was created, `false` when this drag should not
     * be handled at the tabs-list level.
     */
    private _initAnimStateForExternalDrag;
    /** Anim state for an external group-chip drag (gap sized to the group). */
    private _makeGroupDragAnimState;
    /** Anim state for an external single-tab drag. */
    private _makeTabDragAnimState;
    /**
     * Shared body of the dragleave entry point. Preserves anim state when
     * the drag moves between tabs-list children, into the extended drop
     * zone, or into the void container; tears it down otherwise.
     */
    processDragLeave(related: Element | null): void;
    /**
     * Clear the anchored overlay only when this header is what rendered it.
     * The container is shared with the group's content drop target, which
     * renders into it on the same frame the cursor leaves the strip: the
     * pointer backend calls `handleDragOver` on the new target before the
     * global `onDragMove` that reaches us (#1612).
     */
    private clearHeaderAnchorOverlay;
    handleDragOver(event: {
        clientX: number;
        clientY?: number;
    }): void;
    /**
     * Build a lookup from the first panel ID of each non-source group → group
     * ID, so the accumulation walk can add chip widths when it reaches a
     * group's first tab.
     */
    private _buildFirstPanelToGroupMap;
    /**
     * Walk the tabs in flow order by their original main-axis sizes and return
     * the insertion slot for the drag image's leading edge (null if no slot
     * fits).
     */
    private _computeDragOverInsertionIndex;
    /**
     * Rebuild the accumulated original main-axis size up to `insertionIndex`,
     * walking the tabs exactly the way the accumulation loop does, so callers
     * know the original trailing edge of the chip (if any) that precedes the
     * insertion slot.
     */
    private _accumulatedSizeUpTo;
    /**
     * Given a raw insertion index, snap it out of / into any tab group it falls
     * within and resolve the target group (if the drop should merge into one).
     */
    private _resolveInsertionAgainstTabGroups;
    /**
     * Evaluate a single tab group against the proposed insertion index.
     * Returns the resolved `{ insertionIndex, targetTabGroupId }` when this
     * group governs the slot (the caller stops iterating), or `null` when the
     * group is irrelevant and the caller should keep looking.
     */
    private _evaluateTabGroupForInsertion;
    /**
     * The index range this group occupies in the live tab list, excluding the
     * source tab / source group tabs (so dragging a tab out of its own group
     * doesn't inflate the range). Null when the group has no effective tabs or
     * its bounds can't be located.
     */
    private _resolveGroupRange;
    /** Insertion target for a group-chip drag: a group can't be dropped inside
     *  another group, so snap out of the range; a just-before slot is kept. */
    private _resolveGroupDragTarget;
    /** Insertion target for a single-tab drag against a group: decide whether
     *  the drop merges into the group based on the cursor vs the chip edge. */
    private _resolveTabDragTarget;
    /**
     * Whether every tab in the half-open range `[from, to)` is the source tab
     * or one of the source group's tabs.
     */
    private _onlySourceBetween;
    /**
     * Multi-row wrap drag-over: resolve the 2-D insertion slot and show a
     * discrete drop indicator. No gap/FLIP animation (that's 1-D and fights the
     * flow layout, so `applyDragOverTransforms`/`runFlipAnimation` no-op in wrap).
     */
    private handleWrappedDragOver;
    /**
     * The insertion slot (index into the full tab list) for a pointer at
     * `(clientX, clientY)` over a wrapped strip. Two axes:
     *  - horizontal header (rows): pick the row whose vertical span contains
     *    `clientY`, then the slot within it by x-midpoint;
     *  - vertical header (columns): pick the column whose horizontal span
     *    contains `clientX`, then the slot within it by y-midpoint.
     * The pointer's cross-axis coordinate selects the line (nearest line if it
     * falls in an inter-line gap); its main-axis coordinate selects the slot.
     * Excludes the drag source so its own position doesn't bias the result; the
     * drop path adjusts for the source offset.
     */
    private computeWrappedInsertionIndex;
    /**
     * The wrapped drop candidates: each non-source tab's list index + live
     * rect. The drag source (and any grouped tabs moving with it) are excluded
     * so their own positions don't bias the hit-test.
     */
    private _wrappedDragEntries;
    /**
     * Bucket entries into lines by cross-axis start (2px tolerance for sub-pixel
     * rounding), sorted along the cross axis.
     */
    private _bucketWrappedLines;
    /** The line nearest `crossPointer` by cross-axis distance (gap fallback). */
    private _nearestWrappedLine;
    private updateWrapDropIndicator;
    private clearWrapDropIndicator;
    /**
     * Batch-remove a CSS class from multiple elements instantly,
     * forcing only a single reflow for the entire batch.
     */
    private _removeClassInstantlyBatch;
    /**
     * Remove `dv-tab--dragging` from the source tab instantly so it
     * regains its real width before FLIP snapshots.
     */
    uncollapseSourceTab(sourceTabId: string): void;
    applyDragOverTransforms(skipTransition?: boolean): void;
    /** Gap size for the current drag: the whole group's span for a group
     *  drag, otherwise the source tab's own main-axis size. */
    private _computeGapSize;
    /**
     * When the insertion lands at or before a group's first tab, the chip is
     * shifted so the gap appears before the entire group. Returns that chip
     * element, or null when no chip should shift.
     *
     * A chip shifts when dropping outside the group (targetTabGroupId null), or
     * when dropping inside a collapsed group (whose tabs are invisible, so
     * putting the gap on them has no visual effect).
     */
    private _computeChipToShift;
    /**
     * The chip to shift for a single group, or `undefined` to keep scanning the
     * remaining groups. A defined result (the chip element, or null when the
     * governing group has no shiftable chip) stops the scan.
     */
    private _chipToShiftForGroup;
    /** Reset non-source chip margins, then apply the gap margin to the chip or
     *  the first tab at/after the insertion index. */
    private _applyGapMargins;
    /** Pick the correct shifting class for tabs vs chips. */
    private _shiftingClass;
    /** Apply the main-axis gap margin to an element, optionally bypassing CSS
     *  transitions for instant positioning. */
    private _setMargin;
    /** Clear an element's gap margin, animating it back to zero unless
     *  transitions are skipped. */
    private _clearMargin;
    resetTabTransforms(): void;
    /**
     * Commit a group-drag drop: clear drag classes, move the group
     * in the model, and run a FLIP animation.
     */
    commitGroupMove(sourceTabGroupId: string, insertionIndex: number): void;
    private _clearGroupDragClasses;
    resetDragAnimation(): void;
    runFlipAnimation(firstPositions: Map<string, DOMRect>, sourceTabId: string, isCrossGroup?: boolean, animRange?: {
        from: number;
        to: number;
    }): void;
    /**
     * Set a single tab's FLIP transform: the source tab slides in from the end
     * on a cross-group insert; other in-range tabs slide from their first
     * position to their last. Returns true if the tab will animate.
     */
    private _applyFlipTransform;
    /**
     * Next frame, clear the transforms (triggering the CSS transition), track
     * underlines through the slide, and drop the shifting classes once the
     * transform transition ends.
     */
    private _scheduleFlipReset;
}
