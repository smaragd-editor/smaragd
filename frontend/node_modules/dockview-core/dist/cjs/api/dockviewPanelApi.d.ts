import { Emitter, Event } from '../events';
import { GridviewPanelApiImpl, GridviewPanelApi } from './gridviewPanelApi';
import { DockviewGroupPanel } from '../dockview/dockviewGroupPanel';
import { DockviewPanel } from '../dockview/dockviewPanel';
import { DockviewComponent } from '../dockview/dockviewComponent';
import { DockviewPanelRenderer } from '../overlay/overlayRenderContainer';
import { DockviewGroupMoveParams, DockviewGroupPanelLocationChangeEvent } from './dockviewGroupPanelApi';
import { DockviewGroupLocation } from '../dockview/dockviewGroupPanelModel';
export interface TitleEvent {
    readonly title: string;
}
export interface PinnedChangeEvent {
    readonly isPinned: boolean;
}
export interface RendererChangedEvent {
    readonly renderer: DockviewPanelRenderer;
}
export interface ActiveGroupEvent {
    readonly isActive: boolean;
}
export interface GroupChangedEvent {
}
export type DockviewPanelMoveParams = DockviewGroupMoveParams;
export interface DockviewPanelApi extends Omit<GridviewPanelApi, 'setVisible' | 'onDidConstraintsChange'> {
    /**
     * The id of the tab component renderer
     *
     * Undefined if no custom tab renderer is provided
     */
    readonly tabComponent: string | undefined;
    readonly group: DockviewGroupPanel;
    readonly isGroupActive: boolean;
    readonly renderer: DockviewPanelRenderer;
    readonly title: string | undefined;
    /**
     * Whether this panel's tab is pinned. Pinned tabs render before unpinned
     * tabs, never overflow, and resist cross-boundary reorder. Owned by the
     * PinnedTabs module. Reads `false` until a panel is pinned, which requires
     * `pinnedTabs.enabled` (both `setPinned` and restore are gated on it), so a
     * component with pinning disabled always reports `false`.
     */
    readonly isPinned: boolean;
    readonly onDidActiveGroupChange: Event<ActiveGroupEvent>;
    readonly onDidGroupChange: Event<GroupChangedEvent>;
    readonly onDidTitleChange: Event<TitleEvent>;
    readonly onDidChangePinned: Event<PinnedChangeEvent>;
    readonly onDidRendererChange: Event<RendererChangedEvent>;
    readonly location: DockviewGroupLocation;
    readonly onDidLocationChange: Event<DockviewGroupPanelLocationChangeEvent>;
    close(): void;
    setTitle(title: string): void;
    /**
     * Pin or unpin this panel's tab. No-op (warns once) when the PinnedTabs
     * module is not registered, and dormant unless `pinnedTabs.enabled` is set.
     */
    setPinned(pinned: boolean): void;
    setRenderer(renderer: DockviewPanelRenderer): void;
    moveTo(options: DockviewPanelMoveParams): void;
    maximize(): void;
    isMaximized(): boolean;
    exitMaximized(): void;
    /**
     * If you require the Window object
     */
    getWindow(): Window;
}
export declare class DockviewPanelApiImpl extends GridviewPanelApiImpl implements DockviewPanelApi {
    private readonly panel;
    private readonly accessor;
    private _group;
    private readonly _tabComponent;
    readonly _onDidTitleChange: Emitter<TitleEvent>;
    readonly onDidTitleChange: Event<TitleEvent>;
    readonly _onDidChangePinned: Emitter<PinnedChangeEvent>;
    readonly onDidChangePinned: Event<PinnedChangeEvent>;
    private readonly _onDidActiveGroupChange;
    readonly onDidActiveGroupChange: Event<ActiveGroupEvent>;
    private readonly _onDidGroupChange;
    readonly onDidGroupChange: Event<GroupChangedEvent>;
    readonly _onDidRendererChange: Emitter<RendererChangedEvent>;
    readonly onDidRendererChange: Event<RendererChangedEvent>;
    private readonly _onDidLocationChange;
    readonly onDidLocationChange: Event<DockviewGroupPanelLocationChangeEvent>;
    private readonly groupEventsDisposable;
    get location(): DockviewGroupLocation;
    get title(): string | undefined;
    get isPinned(): boolean;
    get isGroupActive(): boolean;
    get renderer(): DockviewPanelRenderer;
    set group(value: DockviewGroupPanel);
    get group(): DockviewGroupPanel;
    get tabComponent(): string | undefined;
    constructor(panel: DockviewPanel, group: DockviewGroupPanel, accessor: DockviewComponent, component: string, tabComponent?: string);
    getWindow(): Window;
    setActive(): void;
    moveTo(options: DockviewPanelMoveParams): void;
    setTitle(title: string): void;
    setPinned(pinned: boolean): void;
    setRenderer(renderer: DockviewPanelRenderer): void;
    close(): void;
    maximize(): void;
    isMaximized(): boolean;
    exitMaximized(): void;
    /**
     * Report that this panel's location may have moved.
     *
     * A relocation touches the location more than once - the panel is
     * reparented into the destination group, then that group is tagged with
     * the location it ends up at - so the event is coalesced to the end of the
     * enclosing layout mutation and reports where the panel actually settled.
     * Firing each signal as it happened surfaced an intermediate `grid`
     * location the panel was never in, at a point where it was in neither
     * group's panel list. Outside a mutation this fires straight away.
     */
    private fireLocationChange;
    private setupGroupEventListeners;
}
