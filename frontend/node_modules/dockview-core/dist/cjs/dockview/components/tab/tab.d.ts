import { Event } from '../../../events';
import { CompositeDisposable } from '../../../lifecycle';
import { DockviewComponent } from '../../dockviewComponent';
import { ITabRenderer } from '../../types';
import { DockviewGroupPanel } from '../../dockviewGroupPanel';
import { DroptargetEvent, WillShowOverlayEvent } from '../../../dnd/droptarget';
import { IDockviewPanel } from '../../dockviewPanel';
import { DockviewHeaderDirection } from '../../options';
export declare class Tab extends CompositeDisposable {
    readonly panel: IDockviewPanel;
    private readonly accessor;
    private readonly group;
    private readonly _element;
    private readonly dropTarget;
    private readonly pointerDropTarget;
    private content;
    private readonly html5DragSource;
    private readonly pointerDragSource;
    private readonly panelTransfer;
    private _direction;
    private _pinIndicator;
    private readonly _onPointDown;
    readonly onPointerDown: Event<MouseEvent>;
    private readonly _onTabClick;
    readonly onTabClick: Event<MouseEvent>;
    private readonly _onDropped;
    readonly onDrop: Event<DroptargetEvent>;
    private readonly _onDragStart;
    readonly onDragStart: Event<PointerEvent | DragEvent>;
    private readonly _onDragEnd;
    readonly onDragEnd: Event<PointerEvent | DragEvent>;
    readonly onWillShowOverlay: Event<WillShowOverlayEvent>;
    get element(): HTMLElement;
    constructor(panel: IDockviewPanel, accessor: DockviewComponent, group: DockviewGroupPanel);
    private _updatePinnedClasses;
    setActive(isActive: boolean): void;
    setContent(part: ITabRenderer): void;
    private _buildOverlayModel;
    setDirection(direction: DockviewHeaderDirection): void;
    updateDragAndDropState(): void;
    /**
     * Vertical tabs are flipped to horizontal so the ghost stays readable
     * during the drag rather than appearing sideways-rotated.
     */
    private _buildGhostElement;
}
