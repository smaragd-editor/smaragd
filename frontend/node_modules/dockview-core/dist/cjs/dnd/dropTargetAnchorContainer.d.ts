import { CompositeDisposable } from '../lifecycle';
import { DropTargetTargetModel } from './droptarget';
export declare class DropTargetAnchorContainer extends CompositeDisposable {
    readonly element: HTMLElement;
    private _model;
    private _outline;
    private _disabled;
    /**
     * Handle for a deferred {@link DropTargetTargetModel.scheduleClear}. The
     * HTML5 backend does not clear this container on `dragleave` (that would
     * churn the shared overlay and kill its slide transition on every crossing
     * between adjacent targets). Instead it *schedules* a clear, which a
     * subsequent `getElements` (the next target rendering into this container)
     * cancels — so the overlay slides between targets, but is torn down when the
     * drag genuinely leaves to somewhere that doesn't re-render here.
     */
    private _pendingClear;
    /**
     * The element the live overlay was rendered for, `undefined` when nothing
     * is showing. The container is shared by every drop target, so a caller
     * tearing down only its own overlay must check this before `clear()`.
     */
    get renderedOutline(): HTMLElement | undefined;
    get disabled(): boolean;
    set disabled(value: boolean);
    private _cancelPendingClear;
    private _clearNow;
    get model(): DropTargetTargetModel | undefined;
    constructor(element: HTMLElement, options: {
        disabled: boolean;
    });
    private createContainer;
    private createAnchor;
}
