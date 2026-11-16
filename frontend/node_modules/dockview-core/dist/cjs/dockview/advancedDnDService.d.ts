import { IDisposable } from '../lifecycle';
import { IDragGhostSpec } from '../dnd/backend';
import { DroptargetOverlayModel, Position } from '../dnd/droptarget';
import { GroupDragEvent, TabDragEvent } from './components/titlebar/tabsContainer';
import { DockviewWillDropEvent } from './dockviewGroupPanelModel';
import { DockviewGroupPanel } from './dockviewGroupPanel';
import { DockviewGroupDropLocation, DockviewWillShowOverlayLocationEvent } from './events';
import { IAdvancedDnDHost, IAdvancedDnDService } from './moduleContracts';
/**
 * Owns the dispatch of the advanced drag-and-drop hooks: `onWillDragPanel`,
 * `onWillDragGroup`, `onWillDrop` and `onWillShowOverlay`, forwarding each to
 * the host's emitters so the public event shape is unchanged whether or not
 * this module is registered.
 *
 * The service holds no drag state of its own. The gesture is driven by the
 * DnD backends, and the per-group subscriptions live on the component's group
 * lifecycle (so groups created mid-move are not missed).
 */
export declare class AdvancedDnDService implements IAdvancedDnDService {
    private readonly host;
    constructor(host: IAdvancedDnDHost);
    dispatchWillDragPanel(event: TabDragEvent): void;
    dispatchWillDragGroup(event: GroupDragEvent): void;
    dispatchWillDrop(event: DockviewWillDropEvent): void;
    dispatchWillShowOverlay(event: DockviewWillShowOverlayLocationEvent): void;
    buildGroupDragGhost(group: DockviewGroupPanel): IDragGhostSpec | undefined;
    resolveOverlayModel(location: DockviewGroupDropLocation, group?: DockviewGroupPanel): DroptargetOverlayModel | undefined;
    showPreviewOverlay(group: DockviewGroupPanel, position: Position): IDisposable;
    dispose(): void;
}
export declare const AdvancedDnDModule: import("./modules").DockviewModule<IAdvancedDnDHost>;
