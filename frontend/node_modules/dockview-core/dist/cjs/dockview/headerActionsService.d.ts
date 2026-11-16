import { IDisposable } from '../lifecycle';
import { Event } from '../events';
import { DockviewComponentOptions } from './options';
import { DockviewGroupPanel } from './dockviewGroupPanel';
import { DockviewApi } from '../api/component.api';
export interface IHeaderActionsHost {
    readonly api: DockviewApi;
    readonly options: DockviewComponentOptions;
    readonly groups: DockviewGroupPanel[];
    readonly onDidAddGroup: Event<DockviewGroupPanel>;
    readonly onDidRemoveGroup: Event<DockviewGroupPanel>;
}
export interface IHeaderActionsService extends IDisposable {
    /** Re-mount the three header action slots on a single group. */
    refresh(group: DockviewGroupPanel): void;
    /** Re-mount on every group; used when one of the three options changes. */
    refreshAll(): void;
    /** Tear down per-group renderer state. */
    disposeGroup(group: DockviewGroupPanel): void;
}
export declare class HeaderActionsService implements IHeaderActionsService {
    private readonly _host;
    private readonly _perGroup;
    constructor(host: IHeaderActionsHost);
    refresh(group: DockviewGroupPanel): void;
    refreshAll(): void;
    disposeGroup(group: DockviewGroupPanel): void;
    dispose(): void;
    private _ensureState;
    private _refreshSlot;
}
export declare const HeaderActionsModule: import("./modules").DockviewModule<IHeaderActionsHost>;
