import { Event } from '../events';
import { CompositeDisposable } from '../lifecycle';
/**
 * The accent color associated with a tab group.
 *
 * This is any CSS color expression: a palette id (e.g. `'grey'`, `'blue'`),
 * a raw color literal (`'#abc123'`, `'rgb(0,0,0)'`), or `undefined` to inherit
 * the default. Resolution to a concrete CSS value is handled by the
 * dockview's `TabGroupColorPalette` (see `tabGroupAccent.ts`).
 *
 * This is a deliberate semantic alias for a public API type; inlining it to
 * `string` would be a breaking API change and lose the documented meaning.
 */
export type DockviewTabGroupColor = string;
export interface SerializedTabGroup {
    id: string;
    label?: string;
    color?: string;
    collapsed: boolean;
    panelIds: string[];
    componentParams?: Record<string, unknown>;
}
export interface TabGroupOptions {
    label?: string;
    color?: string;
    collapsed?: boolean;
    /**
     * Free-form data passed to a custom chip renderer
     * (`createTabGroupChipComponent`). Read via `tabGroup.componentParams`
     * inside the renderer's `init` / `update`. Must be JSON-serializable to
     * round-trip through layout serialization.
     */
    componentParams?: Record<string, unknown>;
}
export interface ITabGroup {
    readonly id: string;
    readonly label: string;
    readonly color: string | undefined;
    readonly collapsed: boolean;
    readonly panelIds: readonly string[];
    readonly size: number;
    readonly isEmpty: boolean;
    readonly componentParams: Record<string, unknown> | undefined;
    readonly onDidChange: Event<void>;
    readonly onDidPanelChange: Event<{
        panelId: string;
        type: 'add' | 'remove';
    }>;
    readonly onDidCollapseChange: Event<boolean>;
    readonly onDidDestroy: Event<void>;
    addPanel(panelId: string, index?: number): void;
    removePanel(panelId: string): boolean;
    indexOfPanel(panelId: string): number;
    containsPanel(panelId: string): boolean;
    setLabel(value: string): void;
    setColor(value: string | undefined): void;
    setComponentParams(value: Record<string, unknown> | undefined): void;
    collapse(): void;
    expand(): void;
    toggle(): void;
    toJSON(): SerializedTabGroup;
    dispose(): void;
}
export declare class TabGroup extends CompositeDisposable implements ITabGroup {
    readonly id: string;
    private _label;
    private _color;
    private _collapsed;
    private _componentParams;
    private readonly _panelIds;
    private readonly _onDidChange;
    readonly onDidChange: Event<void>;
    private readonly _onDidPanelChange;
    readonly onDidPanelChange: Event<{
        panelId: string;
        type: "add" | "remove";
    }>;
    private readonly _onDidCollapseChange;
    readonly onDidCollapseChange: Event<boolean>;
    private readonly _onDidDestroy;
    readonly onDidDestroy: Event<void>;
    get label(): string;
    get color(): string | undefined;
    get componentParams(): Record<string, unknown> | undefined;
    setLabel(value: string): void;
    setColor(value: string | undefined): void;
    setComponentParams(value: Record<string, unknown> | undefined): void;
    get collapsed(): boolean;
    get panelIds(): readonly string[];
    get size(): number;
    get isEmpty(): boolean;
    constructor(id: string, options?: TabGroupOptions);
    addPanel(panelId: string, index?: number): void;
    removePanel(panelId: string): boolean;
    indexOfPanel(panelId: string): number;
    containsPanel(panelId: string): boolean;
    collapse(): void;
    expand(): void;
    toggle(): void;
    toJSON(): SerializedTabGroup;
    dispose(): void;
}
