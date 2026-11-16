import { Event } from '../../../events';
import { CompositeDisposable, IValueDisposable } from '../../../lifecycle';
import { DockviewComponent } from '../../dockviewComponent';
import { DockviewGroupPanel } from '../../dockviewGroupPanel';
import { DockviewWillShowOverlayLocationEvent } from '../../events';
import { IDockviewPanel } from '../../dockviewPanel';
import { DockviewHeaderDirection } from '../../options';
import { Tab } from '../tab/tab';
import { TabDragEvent, TabDropIndexEvent } from './tabsContainer';
import { TabGroupManager } from './tabGroups';
import { ITabReorderHost } from './tabReorderController';
export declare class Tabs extends CompositeDisposable implements ITabReorderHost {
    private readonly group;
    private readonly accessor;
    private readonly _element;
    private readonly _tabsList;
    private readonly _observerDisposable;
    private readonly _pointerActivation;
    private readonly _scrollbar;
    private _tabs;
    private readonly _tabMap;
    private selectedIndex;
    private _showTabsOverflowControl;
    /**
     * Predicate that keeps a panel's tab out of the overflow dropdown
     * regardless of visibility. Wired by the PinnedTabs module so pinned tabs
     * never overflow. Defaults to a no-op so behaviour is unchanged when the
     * module is absent. Must stay a pure lookup (no DOM reads) because it runs
     * inside the overflow filter, which the `OverflowObserver` re-fires on every
     * resize.
     */
    private _overflowExclude;
    /**
     * Predicate that forces a panel's tab into the overflow dropdown regardless
     * of horizontal fit, the complement of {@link _overflowExclude}. Wired by
     * the MultiRowTabs module: in wrap mode tabs never clip horizontally (they
     * wrap), so the `OverflowObserver` detects nothing; this routes the surplus
     * rows beyond `overflow.maxRows` into the dropdown. Defaults to a no-op so
     * behaviour is unchanged when the module is absent. Must stay a pure lookup
     * (no DOM reads) because it runs inside the overflow filter.
     */
    private _forcedOverflow;
    /**
     * When true, pinned (overflow-excluded) tabs stick to the left edge as the
     * strip scrolls horizontally (Chrome-style frozen columns), wired by the
     * PinnedTabs module in inline mode. Each pinned tab is given a cumulative
     * `--dv-pinned-sticky-left` offset. Defaults to off so behaviour is
     * unchanged when the module is absent.
     */
    private _pinnedSticky;
    /** Whether any tab currently carries the sticky styling; lets
     *  {@link _applyPinnedSticky} bail early when there is nothing to do (the
     *  common case for components that never enable the feature). */
    private _hasPinnedStickyStyling;
    private _direction;
    private _voidContainerListeners;
    private readonly _tabGroupManager;
    private readonly _reorder;
    private get _animState();
    private set _animState(value);
    private get _pendingCollapse();
    private set _pendingCollapse(value);
    get tabItems(): IValueDisposable<Tab>[];
    get tabMap(): Map<string, IValueDisposable<Tab>>;
    get tabsList(): HTMLElement;
    get groupPanel(): DockviewGroupPanel;
    get component(): DockviewComponent;
    get tabGroupManager(): TabGroupManager;
    fireDrop(event: TabDropIndexEvent): void;
    private readonly _onTabDragStart;
    readonly onTabDragStart: Event<TabDragEvent>;
    private readonly _onDrop;
    readonly onDrop: Event<TabDropIndexEvent>;
    private readonly _onWillShowOverlay;
    readonly onWillShowOverlay: Event<DockviewWillShowOverlayLocationEvent>;
    private readonly _onOverflowTabsChange;
    readonly onOverflowTabsChange: Event<{
        tabs: string[];
        tabGroups: string[];
        /**
         * Overflow-excluded (pinned) tabs that have themselves clipped out of
         * the strip. Rendered in a dedicated "Pinned" section at the top of the
         * dropdown so an overflowing pinned block stays reachable. Empty unless
         * the {@link _overflowExclude} predicate is wired (PinnedTabs module).
         */
        pinnedTabs: string[];
        reset: boolean;
    }>;
    /**
     * Register a predicate excluding panels from the overflow dropdown (pinned
     * tabs). Re-evaluates the dropdown immediately if overflow is being
     * observed. Passing `() => false` restores default behaviour.
     */
    setOverflowExclude(fn: (panelId: string) => boolean): void;
    /**
     * Register a predicate that forces matching panels into the overflow
     * dropdown regardless of horizontal fit (the MultiRowTabs surplus set, the
     * rows beyond `overflow.maxRows`). Re-evaluates the dropdown immediately.
     * Passing `() => false` restores default behaviour.
     */
    setForcedOverflow(fn: (panelId: string) => boolean): void;
    /** Re-evaluate the overflow dropdown now (e.g. after the exclusion set
     *  changed) instead of waiting for the next resize/scroll observer fire. */
    refreshOverflow(): void;
    /**
     * Enable/disable sticky-on-scroll for pinned tabs (inline mode), wired by
     * the PinnedTabs module. When on, pinned (overflow-excluded) tabs are frozen
     * to the left edge as the strip scrolls, each at the cumulative width of the
     * pinned tabs before it; when off, the sticky styling is cleared. The
     * offsets are scroll-invariant, so they are recomputed only on resize,
     * horizontal scroll (a cheap self-heal after a reorder), and pinned-set
     * changes, not continuously.
     */
    setPinnedSticky(enabled: boolean): void;
    /**
     * Freeze the pinned (overflow-excluded) tabs to the left edge: give each the
     * `dv-tab--pinned-sticky` class and a `--dv-pinned-sticky-left` offset so the
     * CSS `position: sticky` rule holds it in place as the strip scrolls. Clears
     * the styling from any tab that is no longer pinned, and from all tabs when
     * the feature is off.
     */
    private _applyPinnedSticky;
    get showTabsOverflowControl(): boolean;
    set showTabsOverflowControl(value: boolean);
    get element(): HTMLElement;
    /**
     * The scrollable tab list (`.dv-tabs-container`) holding the tab elements,
     * exposed (read-only) so the multi-row wrap controller can measure the
     * wrapped row count and toggle the wrap class. Not the outer header element.
     */
    get tabsListElement(): HTMLElement;
    set voidContainer(el: HTMLElement | null);
    /**
     * Handle a drop that occurred on the void container (empty header
     * space to the right of the tabs). Returns `true` if the drop was
     * consumed by an active group drag, `false` otherwise.
     */
    handleVoidDrop(): boolean;
    get panels(): string[];
    get size(): number;
    get tabs(): Tab[];
    get direction(): DockviewHeaderDirection;
    set direction(value: DockviewHeaderDirection);
    constructor(group: DockviewGroupPanel, accessor: DockviewComponent, options: {
        showTabsOverflowControl: boolean;
    });
    indexOf(id: string): number;
    /** DOM id of the tab element for a panel, used for the tabpanel's `aria-labelledby`. */
    getTabId(panelId: string): string | undefined;
    /** Inverse of {@link getTabId}: the panel whose tab owns `element` (the tab
     *  itself or any descendant of it), or `undefined` for non-tab targets. */
    getPanelForTab(element: Element): IDockviewPanel | undefined;
    isActive(tab: Tab): boolean;
    private _onKeyDown;
    /**
     * Close the tab at `index` and move roving focus to a neighbouring tab so
     * keyboard focus stays in the tablist.
     */
    private _closeTab;
    /** Move the roving focus to the tab at `index` (updates tabindex + DOM focus). */
    private _focusTab;
    /** Move DOM focus to the active tab, the entry point into the tablist. */
    focusActiveTab(): void;
    setActivePanel(panel: IDockviewPanel): void;
    /**
     * Scroll the active tab into view within its scroll container. Uses the
     * element's own offset (relative to the container) rather than accumulating
     * tab client sizes, which omits tab margins and any in-flow group chips
     * between tabs and so undershoots the active tab's real position.
     */
    private _scrollTabIntoView;
    /**
     * Activate a tab in response to a plain (non-shift) left pointerdown.
     *
     * With the HTML5 drag backend the tab is natively `draggable`, and a native
     * drag arms from the same pointerdown+move gesture. Firefox aborts that
     * pending drag if the pointerdown also moves focus / relayouts the tab strip
     * synchronously — which `openPanel` does — so a drag started on an inactive
     * tab never begins (issue #932). Defer the activation past the frame so
     * `dragstart` arms first; a plain click (no drag) still activates on the
     * next frame, which is imperceptible. The pointer backend has no native drag
     * to pre-empt, so it activates synchronously as before.
     */
    private _activateOnPointerDown;
    openPanel(panel: IDockviewPanel, index?: number): void;
    delete(id: string): void;
    private addTab;
    private toggleDropdown;
    updateDragAndDropState(): void;
    /**
     * Synchronize chip elements and CSS classes for all tab groups
     * in the parent group model. Call after any tab group mutation.
     */
    updateTabGroups(): void;
    refreshTabGroupAccent(): void;
    /**
     * Tabs-list-specific side effects of a chip drag start. The chip's
     * drag sources (constructed by `TabGroupManager`) own the transfer
     * payload, iframe shielding, dataTransfer setup, and the HTML5 drag
     * image. This method just sets up the smooth-reorder anim state and
     * collapses the source-group tabs in the tabs list.
     */
    private _handleChipDragStart;
    /**
     * A drop on a tab group chip means "insert before this group". Resolve to
     * the index of the group's first tab, adjusting for same-group removal
     * (when the source tab is currently to the left of the target slot, its
     * removal shifts the insertion index down by one). Always clears
     * `targetTabGroupId` so the dropped tab lands outside the group.
     *
     * A chip dropped on a chip is a group move: the panel path would route it
     * through the cross-group machinery, which rebuilds the tab group under a
     * new id.
     */
    private _handleChipDrop;
    /**
     * Sets the broader container that is part of the same logical drop surface
     * as this tab list (e.g. the full header element).  When a dragleave from
     * the tabs list lands inside this container, `_animState` is preserved so
     * that external dragover listeners can continue the animation.
     */
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
    private snapshotTabPositions;
    private handleDragOver;
    private applyDragOverTransforms;
    private resetTabTransforms;
    private _commitGroupMove;
    private runFlipAnimation;
}
