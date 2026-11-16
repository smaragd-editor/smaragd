import { Overlay } from '../overlay/overlay';
import { CompositeDisposable } from '../lifecycle';
import { Gridview } from '../gridview/gridview';
import { AnchoredBox } from '../types';
import { DockviewGroupPanel, IDockviewGroupPanel } from './dockviewGroupPanel';
export interface IDockviewFloatingGroupPanel {
    readonly group: IDockviewGroupPanel;
    position(bounds: Partial<AnchoredBox>): void;
}
/**
 * The subset of the dedicated floating title bar this panel needs to keep in
 * sync. Declared structurally to avoid a circular import on `FloatingTitleBar`.
 */
export interface IAnchorTrackingTitleBar {
    setGroup(group: DockviewGroupPanel): void;
}
export declare class DockviewFloatingGroupPanel extends CompositeDisposable implements IDockviewFloatingGroupPanel {
    readonly overlay: Overlay;
    /**
     * The floating window hosts its own gridview so it can hold a nested
     * splitview layout of groups, not just a single group.
     */
    readonly gridview: Gridview;
    private _group;
    private _titleBar;
    /**
     * The window's representative/anchor group. A floating window can host a
     * nested layout of several groups; the anchor is used for back-compat
     * single-group APIs and is reassigned if it leaves the window.
     */
    get group(): DockviewGroupPanel;
    /**
     * Register the dedicated title bar (if any) so anchor reassignment keeps
     * its drag handle pointed at a group that still lives in this window.
     */
    setTitleBar(titleBar: IAnchorTrackingTitleBar | undefined): void;
    setAnchorGroup(group: DockviewGroupPanel): void;
    constructor(group: DockviewGroupPanel, overlay: Overlay, 
    /**
     * The floating window hosts its own gridview so it can hold a nested
     * splitview layout of groups, not just a single group.
     */
    gridview: Gridview);
    position(bounds: Partial<AnchoredBox>): void;
}
