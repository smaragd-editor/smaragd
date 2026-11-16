import { IValueDisposable } from '../../../lifecycle';
import { DockviewHeaderDirection, DockviewHeaderPosition } from '../../options';
import { Tab } from '../tab/tab';
import { ITabGroup } from '../../tabGroup';
import { TabGroupColorPalette } from '../../tabGroupAccent';
/**
 * Class for the small accent pip drawn at the leading edge of each wrapped
 * row a tab group spans beyond its first. Echoes the group chip so a
 * multi-row group reads as one group on every row it occupies.
 */
export declare const TAB_GROUP_CHIP_CONTINUATION_CLASS = "dv-tab-group-chip-continuation";
export interface TabGroupIndicatorContext {
    readonly tabsList: HTMLElement;
    getTabGroups(): readonly ITabGroup[];
    getActivePanelId(): string | undefined;
    getTabMap(): Map<string, IValueDisposable<Tab>>;
    getChipElement(groupId: string): HTMLElement | undefined;
    getDirection(): DockviewHeaderDirection;
    getHeaderPosition(): DockviewHeaderPosition;
    getColorPalette(): TabGroupColorPalette | undefined;
}
export interface ITabGroupIndicator {
    readonly underlines: ReadonlyMap<string, HTMLElement>;
    positionUnderlines(): void;
    trackUnderlines(): void;
    syncUnderlineElements(activeGroupIds: Set<string>): void;
    getUnderline(groupId: string): HTMLElement | undefined;
    dispose(): void;
}
/**
 * Shared positioning logic for tab group indicators.
 * Subclasses implement `applyShape` to control the visual output.
 */
declare abstract class BaseTabGroupIndicator implements ITabGroupIndicator {
    protected readonly _ctx: TabGroupIndicatorContext;
    protected readonly _underlines: Map<string, HTMLElement>;
    /**
     * Per-group pool of continuation-marker pips (one per wrapped row the
     * group spans beyond its first). Absolutely positioned so they sit
     * outside the flex-wrap flow, exactly like the underline element.
     */
    private readonly _continuationMarkers;
    private _rafId;
    get underlines(): ReadonlyMap<string, HTMLElement>;
    constructor(_ctx: TabGroupIndicatorContext);
    positionUnderlines(): void;
    /**
     * Continuously reposition underlines every frame for the duration
     * of a tab transition (~200ms), so the underline tracks tab sizes.
     */
    trackUnderlines(): void;
    syncUnderlineElements(activeGroupIds: Set<string>): void;
    getUnderline(groupId: string): HTMLElement | undefined;
    dispose(): void;
    /**
     * Grow/shrink a group's continuation-marker pool to `count` pips,
     * creating/removing DOM nodes as needed, and return the pool.
     */
    private _syncContinuationMarkers;
    /**
     * Remove continuation markers for a single group, or (when `groupId`
     * is omitted) for every group. Used when a group dissolves, stops
     * wrapping, or the indicator is disposed.
     */
    private _clearContinuationMarkers;
    /**
     * Apply the visual shape to the underline element.
     * Called once per tab group per frame with the computed geometry.
     */
    protected abstract applyShape(underline: HTMLElement, tg: ITabGroup, startEdge: number, span: number, containerCrossSize: number, activePanelId: string | undefined, containerRect: DOMRect, isVertical: boolean): void;
    private _positionUnderlinesSync;
    /**
     * Position a group's underline across a multi-line (wrapped) tab strip. The
     * single-bar model can't span lines, so the element is sized to cover the
     * group's line span and an SVG draws one straight segment per line-run of
     * the group's tabs: a horizontal segment per row (horizontal header) or a
     * vertical segment per column (vertical header). Tabs are bucketed into
     * runs by their cross-axis offset: `top` for rows, `left` for columns.
     * (The active-tab wrap-around bump is omitted in wrap; the per-line lines
     * still convey membership.)
     */
    private _positionWrappedUnderline;
    /**
     * Bucket a group's visible tabs into line-runs by their cross-axis offset
     * (rows by `top`, columns by `left`), with a 2px sub-pixel tolerance.
     * `firstRun` is the run holding the group's first tab (the chip's line),
     * tracked by reference so it is correct regardless of axis or header side (a
     * `vertical-rl` first column is right-most, not left-most).
     */
    private _computeWrappedRuns;
    /**
     * Build the SVG `path` data for a group's per-line underline segments: a
     * horizontal segment along each row's edge (`svg-y` offset by `minTop`) or a
     * vertical segment down each column's leading edge (`svg-x` offset by
     * `minLeft`). `inverted` moves the line to the header-facing edge.
     */
    private _wrappedPathData;
    /**
     * Draw a small accent pip at the leading edge of every wrapped line-run a
     * group spans beyond its first. The group's real chip already marks the
     * first run; these lightweight markers echo it on the continuation runs so
     * a group that wraps onto rows/columns 2–3 reads as one group on each line
     * instead of losing its colour after the first.
     *
     * `runs` are the group's line-runs (container-relative geometry) as
     * bucketed by {@link _positionWrappedUnderline}; `firstRun` is the run that
     * holds the chip and is skipped. The pip sits at each continuation run's
     * main-axis start (top of a column, left of a row), centred on the cross
     * axis.
     */
    private _positionContinuationMarkers;
    /**
     * Ensure the underline element holds a single reusable `<svg><path/></svg>`
     * (created once, reused across frames) and return them.
     */
    protected ensureSvgPath(underline: HTMLElement): {
        svg: SVGSVGElement;
        path: SVGPathElement;
    };
}
/**
 * Chrome-style wrap-around indicator using SVG paths.
 */
export declare class WrapTabGroupIndicator extends BaseTabGroupIndicator {
    private _applyStraightLine;
    /**
     * Chrome-style wrap-around underline: a stroked SVG path that runs
     * along the bottom (or left edge in vertical mode), curving up and
     * over the active tab with rounded corners.
     *
     * The SVG and path elements are created once per underline and reused;
     * only the `d`, `stroke`, and viewport attributes are updated each frame.
     */
    protected applyShape(underline: HTMLElement, tg: ITabGroup, groupStart: number, groupSpan: number, containerCrossSize: number, activePanelId: string | undefined, containerRect: DOMRect, isVertical: boolean): void;
}
/**
 * Flat continuous bar indicator: a plain colored line spanning the full tab
 * group width, with no wrap-around.
 */
export declare class NoneTabGroupIndicator extends BaseTabGroupIndicator {
    protected applyShape(underline: HTMLElement, tg: ITabGroup, _startEdge: number, span: number, _containerCrossSize: number, _activePanelId: string | undefined, _containerRect: DOMRect, isVertical: boolean): void;
}
export {};
