import { IDisposable } from '../lifecycle';
import { DockviewGroupPanel } from './dockviewGroupPanel';
import { ITabGroupChipsHost, ITabGroupChipsService } from './moduleContracts';
export declare class TabGroupChipsService implements ITabGroupChipsService {
    private readonly _host;
    constructor(host: ITabGroupChipsHost);
    attachToGroup(group: DockviewGroupPanel): IDisposable;
    dispose(): void;
}
export declare const TabGroupChipsModule: import("./modules").DockviewModule<ITabGroupChipsHost>;
