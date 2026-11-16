import { DockviewGroupPanel } from './dockviewGroupPanel';
import { IDockviewPanel } from './dockviewPanel';
import { ITabGroup } from './tabGroup';
import { IContextMenuHost, IContextMenuService } from './moduleContracts';
export declare class ContextMenuController implements IContextMenuService {
    private readonly accessor;
    constructor(accessor: IContextMenuHost);
    /**
     * A single maximize/restore toggle whose label and behaviour track the
     * group's live state: it reads *Restore* + calls `exitMaximized` when the
     * group is maximized, otherwise *Maximize* + `maximize`. Only grid groups
     * can be maximized, so the item is disabled for floating / popout panels
     * that are not already maximized.
     */
    private buildMaximizeItem;
    /**
     * A single collapse/expand toggle whose label tracks the tab group's live
     * state: *Expand* when the group is already collapsed, otherwise *Collapse*.
     */
    private buildCollapseItem;
    /**
     * Whether to auto-inject the built-in Pin/Unpin item at the top of the tab
     * menu. True only when the PinnedTabs module is registered, pinning is
     * enabled, and the app has not opted out via `pinnedTabs.contextMenuItem:
     * false` (the item is on by default). This keeps pinning reachable from the
     * menu without the app having to return `'pin'` from
     * `getTabContextMenuItems` itself.
     */
    private _shouldInjectPin;
    /**
     * The tab menu items: the app's own items (if any) with the built-in
     * `'pin'` item prepended when {@link _shouldInjectPin} applies, so the app
     * keeps full control of its list, and pinning is added without disturbing
     * it. Reuses the existing `'pin'` token rendering below.
     */
    private _resolveTabItems;
    /**
     * Render a custom `component` menu item and append it to `menuEl`. Builds
     * the framework renderer via the host's `createContextMenuItemComponent`
     * factory and initialises it. Shared by the tab menu and the chip menu,
     * which differ only in `identity`: the tab menu passes the `panel`, the chip
     * menu passes the `tabGroup`. No-op when no renderer could be created (no
     * factory configured, or the factory declined the component).
     */
    private appendComponentItem;
    /**
     * The element for one built-in tab item, or `undefined` for a token this
     * version doesn't know (an app on a newer typings version, or plain JS):
     * an unrecognised token renders nothing rather than throwing.
     */
    private buildBuiltInTabItem;
    /**
     * Append one app-supplied item. A raw `element` is used as-is, a
     * `component` goes through the framework renderer, and a `label` builds the
     * default row; an item carrying none of the three renders nothing. Shared
     * by both menus, which differ only in `identity`.
     */
    private appendConfigItem;
    show(panel: IDockviewPanel, group: DockviewGroupPanel, event: MouseEvent): void;
    showForChip(tabGroup: ITabGroup, group: DockviewGroupPanel, event: MouseEvent): void;
}
export declare const ContextMenuModule: import("./modules").DockviewModule<IContextMenuHost>;
