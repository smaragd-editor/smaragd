import { CspNonceProvider } from './dom';
import { CompositeDisposable } from './lifecycle';
import { Box } from './types';
/**
 * A popout window at a lifecycle boundary. `id` is the target name dockview
 * passed to `window.open`; `window` is the live handle.
 */
export interface PopoutWindowEvent {
    readonly id: string;
    readonly window: Window;
}
/**
 * Why a popout window could not be used:
 *
 * - `url-refused`: the URL failed {@link getPopoutUrlError}.
 * - `blocked`: `window.open` returned nothing, the browser's popup blocker
 *   being the usual reason.
 * - `unscriptable`: a window opened, but the opener cannot reach its document,
 *   so panel DOM cannot be moved into it. Hosts that answer `window.open`
 *   themselves can do this.
 * - `closed`: the window went away before it finished loading.
 */
export type PopoutWindowFailureReason = 'url-refused' | 'blocked' | 'unscriptable' | 'closed';
export interface PopoutWindowFailure {
    readonly reason: PopoutWindowFailureReason;
    /** The refusal itself, where there was one. */
    readonly error?: Error;
}
export type PopoutWindowOptions = {
    url: string;
    onDidOpen?: (event: PopoutWindowEvent) => void;
    onWillClose?: (event: PopoutWindowEvent) => void;
    nonce?: CspNonceProvider;
    /** The root node dockview is mounted in, read when the popout loads.
     *  When it is a shadow root its stylesheets are copied too, since they are
     *  not in `document.styleSheets`. Rules that target the shadow host
     *  (`:host`, `::slotted`) match nothing in the popout. */
    styleRoot?: () => Node;
} & Box;
/**
 * Throwing form of {@link getPopoutUrlError}, for callers with no way to
 * recover from a refused URL.
 */
export declare function assertSameOriginPopoutUrl(url: string): void;
/**
 * The reason `url` is unusable as a popout target, or `undefined` if it is
 * allowed. Rejects anything that isn't same-origin with the page (scheme and
 * host, so a packaged webview's own scheme such as `tauri://` qualifies), and
 * the `javascript:`, `data:`, `blob:`, `vbscript:` and `file:` schemes that
 * would otherwise execute in a context the browser still associates with the
 * opener via `window.opener`.
 *
 * Callers that can recover from a refusal use this rather than catching, so it
 * can be handled without a rejected promise. `page` is what the URL resolves
 * against, and defaults to this page.
 */
export declare function getPopoutUrlError(url: string, page?: Pick<Location, 'href' | 'protocol' | 'host'>): Error | undefined;
export declare class PopoutWindow extends CompositeDisposable {
    private readonly target;
    private readonly className;
    private readonly options;
    private readonly _onWillClose;
    readonly onWillClose: import("./events").Event<void>;
    private readonly _onDidClose;
    readonly onDidClose: import("./events").Event<void>;
    private _window;
    private _failure;
    get window(): Window | null;
    /** Set when {@link open} resolved `null`, saying which way it failed. */
    get failure(): PopoutWindowFailure | undefined;
    constructor(target: string, className: string, options: PopoutWindowOptions);
    dimensions(): Box | null;
    close(): void;
    open(): Promise<HTMLElement | null>;
    /**
     * Backstop for the `beforeunload` signal, which a window torn down without
     * running its unload handlers never sends: a native shell destroying the
     * webview, or a browser discarding the page. `closed` is readable on any
     * handle, cross-origin included. Whichever signal arrives first wins.
     */
    private watchForClose;
    private createPopoutWindowContainer;
}
