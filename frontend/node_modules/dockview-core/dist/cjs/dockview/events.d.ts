import { Position, WillShowOverlayEvent } from '../dnd/droptarget';
import { PanelTransfer } from '../dnd/dataTransfer';
import { DockviewApi } from '../api/component.api';
import { IDockviewPanel } from './dockviewPanel';
import { DockviewGroupPanel } from './dockviewGroupPanel';
import { IDockviewEvent } from '../events';
import { ITabGroup } from './tabGroup';
export type DockviewGroupDropLocation = 'tab' | 'header_space' | 'content' | 'edge';
export interface DockviewWillShowOverlayLocationEventOptions {
    readonly kind: DockviewGroupDropLocation;
    readonly panel: IDockviewPanel | undefined;
    readonly api: DockviewApi;
    readonly group: DockviewGroupPanel | undefined;
    getData: () => PanelTransfer | undefined;
}
export interface DockviewTabGroupChangeEvent {
    readonly tabGroup: ITabGroup;
}
export interface DockviewTabGroupPanelChangeEvent {
    readonly tabGroup: ITabGroup;
    readonly panelId: string;
}
export type DockviewTabGroupCollapsedChangeEvent = DockviewTabGroupChangeEvent;
export declare class DockviewWillShowOverlayLocationEvent implements IDockviewEvent {
    private readonly event;
    readonly options: DockviewWillShowOverlayLocationEventOptions;
    get kind(): DockviewGroupDropLocation;
    /** Narrow with `instanceof DragEvent` before reading `dataTransfer`. */
    get nativeEvent(): DragEvent | PointerEvent;
    get position(): Position;
    /** The resolved cell was marked `edge` (an outer "dock to the whole layout"
     *  cell). See {@link DroptargetEvent.edge}. */
    get edge(): boolean;
    /** The resolved cell docks as a dedicated edge group (display hint). See
     *  {@link PositionResolverResult.edgeGroup}. */
    get edgeGroup(): boolean;
    get defaultPrevented(): boolean;
    get panel(): IDockviewPanel | undefined;
    get api(): DockviewApi;
    get group(): DockviewGroupPanel | undefined;
    preventDefault(): void;
    getData(): PanelTransfer | undefined;
    constructor(event: WillShowOverlayEvent, options: DockviewWillShowOverlayLocationEventOptions);
}
