/**
 * Internal module system for dockview.
 *
 * Modules are feature bundles that register services into the dockview
 * component. `registerModules(...)` is the one public entry point: it lets a
 * sibling package contribute modules that `DockviewComponent` picks up at
 * construction. The richer opt-in surface (a per-component `modules` option,
 * framework wrappers) is still reserved for a future version; the module
 * authoring API (`defineModule`, the service contracts) remains internal.
 */
import { IDisposable } from '../lifecycle';
import { IFloatingGroupService } from './floatingGroupService';
import { IPopoutWindowService } from './popoutWindowService';
import { IWatermarkService } from './watermarkService';
import { IEdgeGroupService } from './edgeGroupService';
import { IRootDropTargetService } from './rootDropTargetService';
import { IHeaderActionsService } from './headerActionsService';
import { ILiveRegionService } from './liveRegionService';
import { IKeyboardNavigationService, IAdvancedDnDService, IAdvancedOverflowService, IAutoHideEdgeGroupService, IAutoEdgeGroupService, IContextMenuService, IDndCompassService, IKeyboardDockingService, ILayoutHistoryService, IMultiRowTabsService, IPinnedTabsService, ISmartGuidesService, ITabGroupChipsService } from './moduleContracts';
export interface ServiceCollection {
    floatingGroupService?: IFloatingGroupService;
    popoutWindowService?: IPopoutWindowService;
    watermarkService?: IWatermarkService;
    edgeGroupService?: IEdgeGroupService;
    tabGroupChipsService?: ITabGroupChipsService;
    contextMenuService?: IContextMenuService;
    rootDropTargetService?: IRootDropTargetService;
    headerActionsService?: IHeaderActionsService;
    advancedDnDService?: IAdvancedDnDService;
    liveRegionService?: ILiveRegionService;
    keyboardNavigationService?: IKeyboardNavigationService;
    keyboardDockingService?: IKeyboardDockingService;
    layoutHistoryService?: ILayoutHistoryService;
    dndCompassService?: IDndCompassService;
    smartGuidesService?: ISmartGuidesService;
    autoHideEdgeGroupService?: IAutoHideEdgeGroupService;
    autoEdgeGroupService?: IAutoEdgeGroupService;
    multiRowTabsService?: IMultiRowTabsService;
    pinnedTabsService?: IPinnedTabsService;
    advancedOverflowService?: IAdvancedOverflowService;
}
export interface DockviewModule<THost = unknown> {
    moduleName: string;
    services?: Record<string, (host: THost) => unknown>;
    /**
     * Optional post-construct hook called once after the host is fully
     * constructed and all module services are instantiated. Use this to
     * subscribe to host events; the returned disposable runs at host
     * teardown. Components don't need to call into the service from event
     * handlers; the module owns its own reactivity.
     */
    init?: (host: THost, services: ServiceCollection) => IDisposable;
    dependsOn?: DockviewModule<any>[];
    /**
     * Top-level option keys that must report *this* module when it isn't
     * registered: the module's half of the contract with core's
     * `OPTION_MODULE_RULES`, which core cannot derive because it can't import
     * the modules it might be missing.
     *
     * Declared here rather than inferred so a test can hold the two in sync:
     * see `enterpriseModuleNames.spec.ts`, which fails if an option listed here
     * has no rule (the user would get silence) or a rule names this module for
     * an option not listed here.
     *
     * List an option only if it should produce a diagnostic naming this module.
     * Options this module merely *reads* don't belong here: `edgeGroupPeek` only
     * tunes `autoHideEdgeGroups` and is inert alone, and where one opt-in gates
     * two modules in the same package (`keyboardNavigation`) only the module the
     * message should name declares it: one mistake, one message.
     */
    options?: string[];
}
/**
 * Typed helper for defining a module. Enforces that the factory's return
 * type matches the slot in ServiceCollection at compile time, replacing
 * the manual cast each module file would otherwise need.
 */
export declare function defineModule<K extends keyof ServiceCollection, THost>(config: {
    name: string;
    serviceKey: K;
    create: (host: THost) => NonNullable<ServiceCollection[K]>;
    init?: (host: THost, service: NonNullable<ServiceCollection[K]>) => IDisposable;
    dependsOn?: DockviewModule<any>[];
    /** See {@link DockviewModule.options}. */
    options?: string[];
}): DockviewModule<THost>;
/**
 * The modules that ship in `dockview-enterprise` rather than the free
 * packages. Core never imports them; it holds their names only so a
 * missing-module message can name the package that provides the fix.
 *
 * Keep in sync with the `Modules` list exported by `dockview-enterprise`.
 */
export declare const ENTERPRISE_MODULE_NAMES: ReadonlySet<string>;
/**
 * For tests: clears the once-per-key dedup cache used by `logMissingModule`
 * (and therefore `assertModule`).
 */
export declare function _resetMissingModuleWarnings(): void;
/**
 * Builds the text for a module that a caller needed but which isn't
 * registered. `reason` describes what the user did to need it (an option they
 * set, an api method they called) and is quoted verbatim. Pass several when one
 * module is needed for several reasons at once: a single message listing them
 * beats one message per reason each repeating the same install instructions.
 *
 * Exported so the rare caller that must throw (see `assertModule`) can raise
 * the same message rather than a thinner second one.
 *
 * Enterprise modules get the install/import fix inline, because importing
 * `dockview-enterprise` self-registers every enterprise module, so there is no
 * separate `registerModules` step for the user to get wrong.
 */
export declare function missingModuleMessage(moduleName: string, reason?: string | string[]): string;
/**
 * Logs a deduplicated "module not registered" error naming what was needed and
 * how to get it. Deduped per module+reasons for the lifetime of the page, so
 * repeated calls (and re-validation on every `updateOptions`) log once.
 */
export declare function logMissingModule(moduleName: string, reason?: string | string[]): void;
/**
 * Returns the service if its module is registered, otherwise logs a
 * deduplicated console error and returns `undefined`. This function never
 * throws: the affected feature degrades to a no-op so consuming applications
 * don't crash in production.
 *
 * The one exception is an entry point that must return a value it cannot
 * synthesise: `addEdgeGroup(): DockviewGroupPanelApi` has no group to hand
 * back and no `undefined` in its return type, so it throws
 * `missingModuleMessage(...)` directly instead of calling this. Don't route
 * such a caller through here: it would log *and* throw, reporting twice.
 *
 * Use at public-API entry points where the caller wants to surface which
 * module is missing. For internal/lifecycle paths, plain `?.` chaining on
 * the service slot is preferred: no log, a silent no-op.
 *
 * Two rules decide whether an entry point guards:
 *
 * 1. **Commands, not queries.** `api.undo()` asked for something to happen, so
 *    silence is a bug report waiting to happen; `canUndo` asked a question, and
 *    `false` is a truthful answer that shouldn't log. Same for event getters
 *    falling back to a never-firing event, and for idempotent cleanup
 *    (`clearHistory()` on an absent history has genuinely nothing to do).
 *
 * 2. **Only if the option rule can't already have fired.** A command reachable
 *    without its gating option (`api.undo()` works on a component that never
 *    set `layoutHistory`) needs this, because no rule will have run. A command
 *    that can't be reached until the option is set doesn't: `setPanelPinned`
 *    returns early unless `pinnedTabs.enabled`, so by the time it could warn,
 *    the option rule has already named the same module. Guarding it too would
 *    report one mistake twice.
 *
 * Rule 2 tolerates one overlap: setting `layoutHistory.enabled` *and* calling
 * `api.undo()` without the module reports both, since the reasons differ and
 * dedup is per module+reason. That's the price of covering the far more likely
 * case: calling `undo()` having never set the option at all.
 *
 * Interaction handlers are queries in this sense too: a right-click reaching an
 * absent module means the app never asked for that feature, so it stays silent
 * (`?.`) and the browser's own behaviour applies. Options are where intent is
 * declared; see `optionsModules.ts`.
 */
export declare function assertModule<T>(service: T | undefined, moduleName: string, context?: string): T | undefined;
export declare class ModuleRegistry<THost> implements IDisposable {
    private readonly _modules;
    private readonly _services;
    private readonly _initDisposables;
    get services(): ServiceCollection;
    register<H>(module: DockviewModule<H>): void;
    initialize(host: THost): void;
    postConstruct(host: THost): void;
    has(moduleName: string): boolean;
    dispose(): void;
}
/**
 * Register modules globally. Idempotent per `moduleName`: registering the
 * same module twice is a no-op. Intended to be called once at import time by
 * the package that bundles a given set of modules.
 */
export declare function registerModules(modules: DockviewModule<any>[]): void;
/**
 * Returns the globally-registered modules (a copy). `DockviewComponent` reads
 * this to extend its built-in module set.
 */
export declare function getRegisteredModules(): DockviewModule<any>[];
/**
 * For tests: clears the global module registry.
 */
export declare function clearRegisteredModules(): void;
