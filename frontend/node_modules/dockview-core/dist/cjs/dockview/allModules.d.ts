import { DockviewModule } from './modules';
/**
 * Internal list of the built-in modules that ship with the core. Registered
 * automatically by DockviewComponent at construction time; not exported from
 * the package. Additional modules contributed by sibling packages (via
 * `registerModules(...)`) are appended at construction.
 */
export declare const AllModules: DockviewModule<any>[];
