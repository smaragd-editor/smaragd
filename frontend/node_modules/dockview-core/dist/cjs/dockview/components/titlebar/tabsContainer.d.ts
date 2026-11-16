import { IDisposable, CompositeDisposable } from '../../../lifecycle';
import { Event } from '../../../events';
import { Tab } from '../tab/tab';
import { DockviewGroupPanel } from '../../dockviewGroupPanel';
import { IDockviewPanel } from '../../dockviewPanel';
import { DockviewComponent } from '../../dockviewComponent';
import { DockviewWillShowOverlayLocationEvent } from '../../events';
import { DockviewHeaderDirection } from '../../options';
export interface TabDropIndexEvent {
    readonly event: DragEvent | PointerEvent;
    readonly index: number;
    readonly targetTabGroupId?: string | null;
}
export interface TabDragEvent {
    /** Narrow with `instanceof DragEvent` before reading `dataTransfer`. */
    readonly nativeEvent: DragEvent | PointerEvent;
    readonly panel: IDockviewPanel;
}
export interface GroupDragEvent {
    /** Narrow with `instanceof DragEvent` before reading `dataTransfer`. */
    readonly nativeEvent: DragEvent | PointerEvent;
    readonly group: DockviewGroupPanel;
}
export interface ITabsContainer extends IDisposable {
    readonly element: HTMLElement;
    /** The scrollable tab list element (`.dv-tabs-container`); see `Tabs.tabsListElement`. */
    readonly tabsListElement: HTMLElement;
    readonly panels: string[];
    readonly size: number;
    readonly onDrop: Event<TabDropIndexEvent>;
    readonly onTabDragStart: Event<TabDragEvent>;
    readonly onGroupDragStart: Event<GroupDragEvent>;
    readonly onWillShowOverlay: Event<DockviewWillShowOverlayLocationEvent>;
    hidden: boolean;
    direction: DockviewHeaderDirection;
    delete(id: string): void;
    indexOf(id: string): number;
    getTabId(panelId: string): string | undefined;
    getPanelForTab(element: Element): IDockviewPanel | undefined;
    setActive(isGroupActive: boolean): void;
    setActivePanel(panel: IDockviewPanel): void;
    focusActiveTab(): void;
    isActive(tab: Tab): boolean;
    closePanel(panel: IDockviewPanel): void;
    openPanel(panel: IDockviewPanel, index?: number): void;
    setRightActionsElement(element: HTMLElement | undefined): void;
    setLeftActionsElement(element: HTMLElement | undefined): void;
    setPrefixActionsElement(element: HTMLElement | undefined): void;
    show(): void;
    hide(): void;
    updateDragAndDropState(): void;
    updateTabGroups(): void;
    refreshTabGroupAccent(): void;
    setOverflowExclude(fn: (panelId: string) => boolean): void;
    setForcedOverflow(fn: (panelId: string) => boolean): void;
    setPinnedSticky(enabled: boolean): void;
    refreshOverflow(): void;
    setDropIndexResolver(fn: (panelId: string, index: number) => number): void;
    resolveDropIndex(panelId: string, index: number): number;
    setPinnedRow(el: HTMLElement | undefined): void;
}
export declare class TabsContainer extends CompositeDisposable implements ITabsContainer {
    private readonly accessor;
    private readonly group;
    private readonly _element;
    private readonly tabs;
    private readonly rightActionsContainer;
    private readonly leftActionsContainer;
    private readonly preActionsContainer;
    private readonly voidContainer;
    private rightActions;
    private leftActions;
    private preActions;
    private _hidden;
    private _direction;
    /**
     * Clamps/redirects a header drop index, wired by the PinnedTabs module to
     * keep drops on the correct side of the pin boundary. Identity by default
     * so behaviour is unchanged when the module is absent.
     */
    private _dropIndexResolver;
    /** The pinned second-row element (PinnedTabs `separate-row` mode), owned by
     *  the module and mounted here. Undefined when there is no row. */
    private _pinnedRow;
    private dropdownPart;
    private _overflowTabs;
    private _overflowTabGroups;
    /** Pinned tabs that have clipped out of the strip, rendered in a "Pinned"
     *  section at the top of the dropdown. Empty unless the PinnedTabs module is
     *  active and the pinned block itself overflows. */
    private _overflowPinnedTabs;
    private readonly _dropdownDisposable;
    private readonly _onDrop;
    readonly onDrop: Event<TabDropIndexEvent>;
    get onTabDragStart(): Event<TabDragEvent>;
    private readonly _onGroupDragStart;
    readonly onGroupDragStart: Event<GroupDragEvent>;
    private readonly _onWillShowOverlay;
    readonly onWillShowOverlay: Event<DockviewWillShowOverlayLocationEvent>;
    get panels(): string[];
    get size(): number;
    get hidden(): boolean;
    set hidden(value: boolean);
    get direction(): DockviewHeaderDirection;
    set direction(value: DockviewHeaderDirection);
    get element(): HTMLElement;
    get tabsListElement(): HTMLElement;
    constructor(accessor: DockviewComponent, group: DockviewGroupPanel);
    show(): void;
    hide(): void;
    setRightActionsElement(element: HTMLElement | undefined): void;
    setLeftActionsElement(element: HTMLElement | undefined): void;
    setPrefixActionsElement(element: HTMLElement | undefined): void;
    isActive(tab: Tab): boolean;
    indexOf(id: string): number;
    getTabId(panelId: string): string | undefined;
    getPanelForTab(element: Element): IDockviewPanel | undefined;
    setActive(_isGroupActive: boolean): void;
    delete(id: string): void;
    setActivePanel(panel: IDockviewPanel): void;
    focusActiveTab(): void;
    openPanel(panel: IDockviewPanel, index?: number): void;
    closePanel(panel: IDockviewPanel): void;
    setOverflowExclude(fn: (panelId: string) => boolean): void;
    setForcedOverflow(fn: (panelId: string) => boolean): void;
    setPinnedSticky(enabled: boolean): void;
    refreshOverflow(): void;
    setPinnedRow(el: HTMLElement | undefined): void;
    setDropIndexResolver(fn: (panelId: string, index: number) => number): void;
    resolveDropIndex(panelId: string, index: number): number;
    private updateClassnames;
    private toggleDropdown;
    /**
     * Build the core row/header builders + popover control shared by the free
     * overflow list and the advanced overflow module. Everything the module
     * needs to rebuild the dropdown body in a custom order lives here, so the
     * row DOM, group-header DOM, click-to-activate, and (critically) the
     * window-bound popover open/close stay in core, so the module never captures
     * the wrong `window` for a popped-out group.
     */
    private createOverflowRenderContext;
    /**
     * The free (module-absent) overflow list: the flat `.dv-tabs-overflow-container`
     * body with a group header before the first member tab of each overflow
     * group, in tab (DOM) order. Reuses the shared row/header builders so it
     * stays identical to the advanced path's per-row DOM.
     */
    private renderFreeOverflowList;
    updateDragAndDropState(): void;
    updateTabGroups(): void;
    refreshTabGroupAccent(): void;
}
