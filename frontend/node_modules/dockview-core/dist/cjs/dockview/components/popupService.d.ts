import { CompositeDisposable } from '../../lifecycle';
export declare class PopupService extends CompositeDisposable {
    private readonly _element;
    private _active;
    private readonly _activeDisposable;
    private _root;
    private readonly _window;
    constructor(root: HTMLElement, win?: Window);
    /**
     * Move the popup anchor into a new root element. Call this when a shell
     * wraps the dockview component so that edge-group overflow dropdowns
     * position correctly relative to the full layout area.
     */
    updateRoot(newRoot: HTMLElement): void;
    openPopover(element: HTMLElement, position: {
        x: number;
        y: number;
        zIndex?: string;
    }, options?: {
        onClose?: () => void;
    }): void;
    close(): void;
}
