import { IDisposable } from '../lifecycle';
import { Event } from '../events';
import { IWatermarkRenderer } from './types';
import { DockviewApi } from '../api/component.api';
import { DockviewGroupPanel } from './dockviewGroupPanel';
export interface IWatermarkHost {
    readonly api: DockviewApi;
    readonly mountElement: HTMLElement;
    createWatermarkComponent(): IWatermarkRenderer;
    hasVisibleGridGroup(): boolean;
    readonly onDidAdd: Event<DockviewGroupPanel>;
    readonly onDidRemove: Event<DockviewGroupPanel>;
    readonly onDidViewVisibilityChangeMicroTaskQueue: Event<unknown>;
}
export interface IWatermarkService extends IDisposable {
    /** Mount or unmount the watermark based on current grid state. */
    update(): void;
    /** Tear down the current watermark and re-evaluate. Used when the watermark factory option changes. */
    refresh(): void;
}
export declare class WatermarkService implements IWatermarkService {
    private readonly _host;
    private _watermark;
    constructor(host: IWatermarkHost);
    update(): void;
    refresh(): void;
    private _unmount;
    dispose(): void;
}
export declare const WatermarkModule: import("./modules").DockviewModule<IWatermarkHost>;
