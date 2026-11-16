import { Event } from '../../../events';
import { CompositeDisposable } from '../../../lifecycle';
import { ITabGroup } from '../../tabGroup';
import { TabGroupColorPalette } from '../../tabGroupAccent';
import { ITabGroupChipRenderer } from '../../framework';
import { DockviewApi } from '../../../api/component.api';
/**
 * Visual chip for a tab group. Owns the DOM element, label, click /
 * context-menu interactions, and exposes a long-press gesture as a
 * second `onContextMenu` source. Drag-and-drop wiring lives in
 * `TabGroupManager`, which constructs the drag sources on this
 * chip's element so it can include tabs-list context (custom group
 * drag image, tab-group transfer payload).
 */
export declare class TabGroupChip extends CompositeDisposable implements ITabGroupChipRenderer {
    private readonly _palette?;
    private readonly _element;
    private readonly _label;
    private _tabGroup;
    private readonly _onClick;
    readonly onClick: Event<MouseEvent>;
    private readonly _onContextMenu;
    /** Fires on right-click and on touch long-press. */
    readonly onContextMenu: Event<MouseEvent>;
    get element(): HTMLElement;
    constructor(_palette?: TabGroupColorPalette | undefined);
    init(params: {
        tabGroup: ITabGroup;
        api: DockviewApi;
    }): void;
    update(params: {
        tabGroup: ITabGroup;
    }): void;
    private updateColor;
    private updateLabel;
    private updateCollapsed;
}
