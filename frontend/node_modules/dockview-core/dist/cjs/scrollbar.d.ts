import { CompositeDisposable } from './lifecycle';
export declare class Scrollbar extends CompositeDisposable {
    private readonly scrollableElement;
    private readonly _element;
    private readonly _scrollbar;
    private _scrollOffset;
    private _animationTimer;
    private _pendingStyleFrame;
    private _orientation;
    static readonly MouseWheelSpeed = 1;
    get element(): HTMLElement;
    get orientation(): 'horizontal' | 'vertical';
    set orientation(value: 'horizontal' | 'vertical');
    constructor(scrollableElement: HTMLElement);
    /**
     * Coalesce the scrollbar restyle to one pass per animation frame. The
     * wheel / scroll / pointermove handlers can each fire many times per frame,
     * and `calculateScrollbarStyles` both reads layout (`clientWidth`/
     * `scrollWidth`) and writes styles + `scrollLeft`/`scrollTop`; running it
     * synchronously per event caused repeated read→write→read reflow. Batching
     * to a frame keeps a burst of events to a single measure+write.
     */
    private scheduleStyleUpdate;
    private calculateScrollbarStyles;
}
