import { IDisposable } from '../lifecycle';
import { DockviewGroupPanel } from './dockviewGroupPanel';
import { EdgeGroupPosition } from './dockviewShell';
/**
 * EdgeGroupService is a pure registry: it tracks which positions are
 * occupied and owns each edge group's per-instance cleanup disposable.
 *
 * The ShellManager (layout infrastructure) and the addEdgeGroup
 * orchestration remain on DockviewComponent.
 */
export interface IEdgeGroupServiceHost {
}
export interface IEdgeGroupService extends IDisposable {
    add(position: EdgeGroupPosition, group: DockviewGroupPanel, autoCollapseDisposable: IDisposable): void;
    remove(position: EdgeGroupPosition): void;
    get(position: EdgeGroupPosition): DockviewGroupPanel | undefined;
    has(position: EdgeGroupPosition): boolean;
    hasAny(): boolean;
    entries(): IterableIterator<[EdgeGroupPosition, DockviewGroupPanel]>;
    includes(group: DockviewGroupPanel): boolean;
    findPositionOf(group: DockviewGroupPanel): EdgeGroupPosition | undefined;
    /**
     * Per-group auto-hide opt-in. `undefined` means "unset", so callers should
     * fall back to the global `autoHideEdgeGroups` option. This lets a static
     * edge group and an auto-hiding one co-exist in the same layout.
     */
    setAutoHide(group: DockviewGroupPanel, value: boolean | undefined): void;
    isAutoHide(group: DockviewGroupPanel): boolean | undefined;
    /**
     * Per-group "auto-reveal" flag. When set, an edge group tears itself down
     * to zero footprint when emptied (instead of collapsing to a strip). This
     * is the state used by drag-revealed edges.
     */
    setAutoReveal(group: DockviewGroupPanel, value: boolean): void;
    isAutoReveal(group: DockviewGroupPanel): boolean;
    disposeAll(): void;
}
export declare class EdgeGroupService implements IEdgeGroupService {
    private readonly _edgeGroups;
    private readonly _edgeGroupDisposables;
    private readonly _autoHide;
    private readonly _autoReveal;
    add(position: EdgeGroupPosition, group: DockviewGroupPanel, autoCollapseDisposable: IDisposable): void;
    remove(position: EdgeGroupPosition): void;
    get(position: EdgeGroupPosition): DockviewGroupPanel | undefined;
    has(position: EdgeGroupPosition): boolean;
    hasAny(): boolean;
    entries(): IterableIterator<[EdgeGroupPosition, DockviewGroupPanel]>;
    includes(group: DockviewGroupPanel): boolean;
    findPositionOf(group: DockviewGroupPanel): EdgeGroupPosition | undefined;
    setAutoHide(group: DockviewGroupPanel, value: boolean | undefined): void;
    isAutoHide(group: DockviewGroupPanel): boolean | undefined;
    setAutoReveal(group: DockviewGroupPanel, value: boolean): void;
    isAutoReveal(group: DockviewGroupPanel): boolean;
    disposeAll(): void;
    dispose(): void;
}
export declare const EdgeGroupModule: import("./modules").DockviewModule<IEdgeGroupServiceHost>;
