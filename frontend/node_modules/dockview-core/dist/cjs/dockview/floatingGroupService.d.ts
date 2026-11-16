import { IDisposable } from '../lifecycle';
import { Gridview } from '../gridview/gridview';
import { Overlay } from '../overlay/overlay';
import { DockviewFloatingGroupPanel } from './dockviewFloatingGroupPanel';
import { DockviewGroupPanel } from './dockviewGroupPanel';
import { DockviewOptions } from './options';
import { SerializedFloatingGroup } from './dockviewComponent';
/**
 * Narrow callback surface the FloatingGroupService needs from its host
 * component. Keeps the service decoupled from DockviewComponent.
 */
export interface IFloatingGroupHost {
    fireLayoutChange(): void;
}
export interface IFloatingGroupService extends IDisposable {
    readonly floatingGroups: readonly DockviewFloatingGroupPanel[];
    add(group: DockviewGroupPanel, overlay: Overlay, gridview: Gridview): DockviewFloatingGroupPanel;
    findByGroup(group: DockviewGroupPanel): DockviewFloatingGroupPanel | undefined;
    serialize(): SerializedFloatingGroup[];
    constrainBounds(): void;
    updateBounds(options: Partial<DockviewOptions>): void;
    disposeAll(): void;
}
export declare class FloatingGroupService implements IFloatingGroupService {
    private readonly _host;
    private readonly _floatingGroups;
    get floatingGroups(): readonly DockviewFloatingGroupPanel[];
    constructor(host: IFloatingGroupHost);
    add(group: DockviewGroupPanel, overlay: Overlay, gridview: Gridview): DockviewFloatingGroupPanel;
    findByGroup(group: DockviewGroupPanel): DockviewFloatingGroupPanel | undefined;
    serialize(): SerializedFloatingGroup[];
    constrainBounds(): void;
    updateBounds(options: Partial<DockviewOptions>): void;
    disposeAll(): void;
    dispose(): void;
}
export declare const FloatingGroupModule: import("./modules").DockviewModule<IFloatingGroupHost>;
