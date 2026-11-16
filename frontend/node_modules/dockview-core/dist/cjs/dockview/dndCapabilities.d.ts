import { DockviewOptions } from './options';
/**
 * Which drag-and-drop backends are live: the `dndStrategy` option resolved
 * against the device. Read by the drag-source / drop-target construction sites,
 * and exposed to consumers as `api.dndCapabilities`.
 */
export interface DndCapabilities {
    /** HTML5 drag/drop wiring active (draggable attr, dragstart). */
    readonly html5: boolean;
    /** Pointer-event drag source active. */
    readonly pointer: boolean;
    /**
     * When true, the pointer source handles mouse pointers too
     * (`touchOnly: false`). Implies `pointer` is true.
     */
    readonly pointerHandlesMouse: boolean;
}
export declare function resolveDndCapabilities(options: Pick<DockviewOptions, 'dndStrategy' | 'disableDnd'>): DndCapabilities;
