import { IDisposable } from '../lifecycle';
import { Event } from '../events';
import { PopupService } from './components/popupService';
import { PopoutWindow } from '../popoutWindow';
import { DockviewGroupPanel } from './dockviewGroupPanel';
import { SerializedPopoutGroup } from './dockviewComponent';
import { Gridview } from '../gridview/gridview';
import { OverlayRenderContainer } from '../overlay/overlayRenderContainer';
import { DropTargetAnchorContainer } from '../dnd/dropTargetAnchorContainer';
export interface PopoutGroupEntry {
    window: PopoutWindow;
    popoutGroup: DockviewGroupPanel;
    referenceGroup?: string;
    /**
     * The popout window hosts its own gridview so it can hold a nested
     * splitview layout of groups. `popoutGroup` is the window's anchor group.
     */
    gridview: Gridview;
    /**
     * Render / drop-target containers and window accessor for this popout, so
     * groups relocated into the window can be wired to its own document.
     */
    overlayRenderContainer: OverlayRenderContainer;
    dropTargetContainer: DropTargetAnchorContainer;
    getWindow: () => Window;
    popoutUrl?: string;
    /**
     * The window-scoped popup service shared by every group in this popout
     * window (resolved per-member via {@link IPopoutWindowService.findByGroup}
     * so overflow/context menus render in the correct window regardless of
     * which group is the anchor).
     */
    popupService: PopupService;
    /**
     * Promote a new anchor group after the current one leaves the window,
     * rebinding anchor-relative state (focus routing) to it.
     */
    setAnchorGroup: (group: DockviewGroupPanel) => void;
    disposable: {
        dispose: () => DockviewGroupPanel | undefined;
    };
}
/**
 * Narrow callback surface the PopoutWindowService needs from its host.
 */
export interface IPopoutWindowHost {
    readonly isDisposed: boolean;
}
export interface IPopoutWindowService extends IDisposable {
    readonly entries: readonly PopoutGroupEntry[];
    readonly onDidRemove: Event<PopoutGroupEntry>;
    add(entry: PopoutGroupEntry): void;
    remove(entry: PopoutGroupEntry): void;
    findByGroup(group: DockviewGroupPanel): PopoutGroupEntry | undefined;
    findReferenceGroupId(group: DockviewGroupPanel): string | undefined;
    observeGridviewSize(popoutWindow: PopoutWindow, gridview: Gridview, overlayRenderContainer: OverlayRenderContainer): IDisposable | undefined;
    readonly restorationPromise: Promise<void>;
    scheduleRestoration(delayMs: number, work: () => void | Promise<unknown>, onCancel?: () => void): Promise<void>;
    finishRestoration(promises: Promise<void>[]): void;
    cancelPendingRestorations(): void;
    serialize(): SerializedPopoutGroup[];
    disposeAll(): void;
}
export declare class PopoutWindowService implements IPopoutWindowService {
    private readonly _host;
    private readonly _entries;
    private readonly _restorationCleanups;
    private _restorationPromise;
    private readonly _onDidRemove;
    readonly onDidRemove: Event<PopoutGroupEntry>;
    constructor(host: IPopoutWindowHost);
    get entries(): readonly PopoutGroupEntry[];
    get restorationPromise(): Promise<void>;
    add(entry: PopoutGroupEntry): void;
    remove(entry: PopoutGroupEntry): void;
    findByGroup(group: DockviewGroupPanel): PopoutGroupEntry | undefined;
    findReferenceGroupId(group: DockviewGroupPanel): string | undefined;
    /**
     * The popout window's innerWidth/innerHeight are often 0/stale until it has
     * painted, and the nested gridview lays its children out to the size passed
     * to layout() (a plain group fills via CSS instead). To stop content
     * rendering into a zero box until a manual resize, and to avoid the race a
     * fixed number of animation frames had, observe the gridview element with
     * a ResizeObserver created in the popout window's own realm. A parent-realm
     * observer fires unreliably across the window boundary; a same-realm one
     * fires reliably, including the initial observation once the window is
     * sized.
     *
     * @returns a disposable that disconnects the observer, or `undefined` when
     * the popout realm has no ResizeObserver (e.g. jsdom).
     */
    observeGridviewSize(popoutWindow: PopoutWindow, gridview: Gridview, overlayRenderContainer: OverlayRenderContainer): IDisposable | undefined;
    /**
     * Runs `work` after `delayMs`, resolving once it has finished. Work that
     * returns a promise is awaited, so a caller holding
     * `restorationPromise` waits for the popout window itself rather than
     * only for the timer that starts it.
     */
    scheduleRestoration(delayMs: number, work: () => void | Promise<unknown>, onCancel?: () => void): Promise<void>;
    finishRestoration(promises: Promise<void>[]): void;
    cancelPendingRestorations(): void;
    serialize(): SerializedPopoutGroup[];
    disposeAll(): void;
    dispose(): void;
}
export declare const PopoutWindowModule: import("./modules").DockviewModule<IPopoutWindowHost>;
