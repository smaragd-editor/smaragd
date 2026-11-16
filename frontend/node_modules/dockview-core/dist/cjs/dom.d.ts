import { Event as DockviewEvent, Emitter } from './events';
import { IDisposable, CompositeDisposable } from './lifecycle';
export interface OverflowEvent {
    hasScrollX: boolean;
    hasScrollY: boolean;
}
export declare class OverflowObserver extends CompositeDisposable {
    private readonly _onDidChange;
    readonly onDidChange: DockviewEvent<OverflowEvent>;
    private _value;
    constructor(el: HTMLElement);
}
export declare function watchElementResize(element: HTMLElement, cb: (entry: ResizeObserverEntry) => void): IDisposable;
export declare const removeClasses: (element: HTMLElement, ...classes: string[]) => void;
export declare const addClasses: (element: HTMLElement, ...classes: string[]) => void;
export declare const toggleClass: (element: HTMLElement, className: string, isToggled: boolean) => void;
export declare function isAncestor(testChild: Node | null, testAncestor: Node | null): boolean;
export declare function getElementsByTagName(tag: string, document: ParentNode): HTMLElement[];
export interface IFocusTracker extends IDisposable {
    readonly onDidFocus: DockviewEvent<void>;
    readonly onDidBlur: DockviewEvent<void>;
    refreshState?(): void;
}
export declare function trackFocus(element: HTMLElement): IFocusTracker;
export declare function quasiPreventDefault(event: Event): void;
export declare function quasiDefaultPrevented(event: Event): boolean;
/** Whether the event originated within any of `elements`. Checks the
 *  composed path, so it also holds for elements inside a shadow root, which a
 *  window or document listener sees retargeted to the shadow host. */
export declare function isEventWithin(event: Event, elements: readonly Element[]): boolean;
/** Every shadow root between `element` and its document, innermost first. An
 *  element in a component nested inside another component sits in more than
 *  one, and an event is cut at each boundary. */
export declare function shadowRootsOf(node: Node): ShadowRoot[];
/**
 * `element` as a listener rooted in `scope`'s tree sees it. A node in a shadow
 * root *below* that tree is retargeted to its host there, repeatedly for
 * nested roots; a node already in the same tree is returned unchanged. Omit
 * `scope` (or pass a node in the document) for the document-level view, which
 * is what a window listener gets.
 *
 * The scope matters: a layer living inside a shadow root must be able to tell
 * its own elements apart, and retargeting everything out to the document would
 * collapse them all onto the one host.
 */
export declare function retargetInto(element: Element, scope?: Node | null): Element;
export type CspNonceProvider = string | ((targetDocument: Document) => string | undefined);
export interface AddStylesOptions {
    nonce?: CspNonceProvider;
}
export declare function addStyles(document: Document, styleSheetList: StyleSheetList | readonly CSSStyleSheet[], options?: AddStylesOptions): void;
export declare function getDomNodePagePosition(domNode: Element): {
    left: number;
    top: number;
    width: number;
    height: number;
};
/**
 * Check whether an element is in the DOM (including the Shadow DOM)
 * @see https://terodox.tech/how-to-tell-if-an-element-is-in-the-dom-including-the-shadow-dom/
 */
export declare function isInDocument(element: Element): boolean;
/** Duck-typed so it holds for a shadow root from another window's realm. */
export declare function isShadowRoot(node: Node | null | undefined): node is ShadowRoot;
/**
 * The document or shadow root to hit-test (`elementFromPoint` /
 * `elementsFromPoint`) against for `node`. Hit-testing on the document stops
 * at a shadow host, so when dockview is mounted in a shadow root it has to go
 * through that root to reach its own elements. Falls back to the owning
 * document (which may be a popout's) for a detached node.
 */
export declare function getHitTestRoot(node: Node): DocumentOrShadowRoot;
export declare function addTestId(element: HTMLElement, id: string): void;
export declare function disableIframePointEvents(rootNode?: ParentNode): {
    release: () => void;
};
/**
 * Suppress text selection for the duration of a pointer drag.
 *
 * A pointer drag is just a held button as far as the browser is concerned, so
 * it selects text under the cursor as it travels. HTML5 drag-and-drop is
 * exempt - the browser owns the gesture - which is why this is only needed on
 * the pointer backend.
 *
 * `user-select: none` alone is not enough on WebKit: it starts the selection
 * gesture from a mousedown on a `user-select: none` element unless that
 * element is also natively draggable, then extends it into whatever the
 * pointer crosses. Cancelling `selectstart` refuses that first extension,
 * which ends the gesture for the rest of the drag.
 *
 * An existing selection is left alone: a mousedown on a `user-select: none`
 * element does not clear one natively, and a pointer drag should not either.
 */
export declare function disableTextSelection(rootNode?: ParentNode): {
    release: () => void;
};
export declare function getDockviewTheme(element: HTMLElement): string | undefined;
export declare class Classnames {
    private readonly element;
    private _classNames;
    constructor(element: HTMLElement);
    setClassNames(classNames: string): void;
}
export declare function isChildEntirelyVisibleWithinParent(child: HTMLElement, parent: HTMLElement): boolean;
export declare function onDidWindowMoveEnd(window: Window): Emitter<void>;
export declare function onDidWindowResizeEnd(element: Window, cb: () => void): CompositeDisposable;
export declare function shiftAbsoluteElementIntoView(element: HTMLElement, root: HTMLElement, options?: {
    buffer?: number;
}): void;
export declare function findRelativeZIndexParent(el: HTMLElement): HTMLElement | null;
/** Whether the user has requested reduced motion: the JS counterpart to the
 *  `prefers-reduced-motion` media query, for animations driven in script. */
export declare function prefersReducedMotion(doc?: Document): boolean;
/** The first opaque computed background colour walking up from `element` (the
 *  element itself, then its ancestors). Use to give a floating/overlapping
 *  surface a non-see-through backdrop derived from the live DOM. Returns `''`
 *  when nothing opaque is found (let the stylesheet decide). */
export declare function resolveOpaqueBackground(element: HTMLElement): string;
/** The focused element as seen from `node`'s own tree. Unlike
 *  `document.activeElement`, which is the shadow host when focus is inside a
 *  shadow root, this reaches into the root `node` lives in (and a popout's
 *  own document), while a web component nested inside that tree still
 *  resolves to its host there. */
export declare function getActiveElement(node: Node): Element | null;
/** Where to append a floating element (e.g. a drag ghost) for `node`: its
 *  shadow root when it lives in one, so styles scoped there still apply,
 *  otherwise the body of its own document (which may be a popout's). */
export declare function getOverlayParent(node: Node): ParentNode;
