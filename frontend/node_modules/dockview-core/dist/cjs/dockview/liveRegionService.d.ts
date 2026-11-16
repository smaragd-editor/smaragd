import { CompositeDisposable, IDisposable } from '../lifecycle';
import { Event } from '../events';
import { IDockviewPanel } from './dockviewPanel';
import { DockviewGroupPanel } from './dockviewGroupPanel';
import { DockviewLayoutMutationEvent, DockviewMaximizedGroupChangeEvent } from './dockviewComponent';
import { DockviewComponentOptions } from './options';
/**
 * The narrow surface the {@link LiveRegionService} needs from the host
 * (the `DockviewComponent`): somewhere to mount the region and the layout
 * events to narrate. `onWill/onDidMutateLayout` are used to suppress the
 * bulk-load / clear burst (one transaction, not N panel announcements).
 */
export interface ILiveRegionHost {
    readonly element: HTMLElement;
    readonly options: DockviewComponentOptions;
    readonly onDidAddPanel: Event<IDockviewPanel>;
    readonly onDidRemovePanel: Event<IDockviewPanel>;
    readonly onWillMutateLayout: Event<DockviewLayoutMutationEvent>;
    readonly onDidMutateLayout: Event<DockviewLayoutMutationEvent>;
    readonly onDidMaximizedGroupChange: Event<DockviewMaximizedGroupChangeEvent>;
    readonly onDidAddGroup: Event<DockviewGroupPanel>;
    readonly onDidRemoveGroup: Event<DockviewGroupPanel>;
    /** Live popout windows + a signal when that set changes, so the service can
     *  mount a live region inside each popout document and route to it. */
    getPopoutWindows(): Window[];
    readonly onDidChangePopouts: Event<void>;
}
export interface ILiveRegionService extends IDisposable {
    /**
     * Announce a message to assistive technology via the live region. This
     * is the shared sink: the accessibility module writes keyboard-docking
     * narration here too, so all announcements use one region.
     */
    announce(message: string, politeness?: 'polite' | 'assertive'): void;
}
/**
 * Narrates layout state changes to screen readers via visually-hidden
 * `aria-live` regions. Free / core (WCAG 4.1.3). Announces panel open/close +
 * the shared `announce()` sink (the accessibility module narrates docking here too).
 * Two regions: a **polite** one for routine status and an **assertive** one
 * for errors/cancellations. The bulk load/clear burst is suppressed via the
 * mutation-transaction events, and an app can take over delivery entirely with
 * the `announcer` option.
 */
export declare class LiveRegionService extends CompositeDisposable implements ILiveRegionService {
    private readonly _host;
    private readonly _mainWindow;
    /** One live-region pair per window (main + each popout document). */
    private readonly _regions;
    private _suppressDepth;
    private readonly _locationSubs;
    constructor(host: ILiveRegionHost);
    /** Create a live region in every popout document that lacks one, and remove
     *  regions for popouts that have closed. The main window's pair is permanent. */
    private _syncPopoutRegions;
    private _disposeRegions;
    /** Route announcements to the live region of the window that currently has
     *  focus, so a screen-reader user in a popout hears them, falling back to
     *  the main window. */
    private _focusedRegions;
    private _trackLocation;
    announce(message: string, politeness?: 'polite' | 'assertive'): void;
    private _announce;
    private _defaultMessage;
}
export declare const LiveRegionModule: import("./modules").DockviewModule<ILiveRegionHost>;
