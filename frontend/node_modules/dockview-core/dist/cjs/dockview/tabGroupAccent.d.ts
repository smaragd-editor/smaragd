/**
 * A single entry in the tab-group color palette.
 *
 * `id` is the value stored on `ITabGroup.color` and serialized in
 * `SerializedTabGroup.color`. `value` is any CSS color expression: a hex
 * literal, an rgb()/hsl()/oklch() function, or a `var(...)` reference.
 *
 * The default palette ships with `var(--dv-tab-group-color-${id})` values so
 * themes can override the defaults purely in CSS. User-supplied palettes
 * typically use raw color literals.
 */
export interface DockviewTabGroupColorEntry {
    id: string;
    value: string;
    label?: string;
}
export declare const DEFAULT_TAB_GROUP_COLORS: readonly DockviewTabGroupColorEntry[];
/**
 * Runtime palette for tab-group color accents.
 *
 * Resolves a stored `color` string to a CSS color expression, with three
 * fall-through modes:
 *   1. `id` matches an entry → entry's `value`
 *   2. `id` doesn't match → `id` itself (raw CSS literal pass-through)
 *   3. `id` is empty or undefined → undefined (caller skips assignment)
 *
 * When `enabled` is false the palette returns undefined for everything; this
 * is the `tabGroupAccent: 'off'` opt-out path.
 */
export declare class TabGroupColorPalette {
    private _entries;
    private _byId;
    private _enabled;
    constructor(entries: readonly DockviewTabGroupColorEntry[], enabled?: boolean);
    get enabled(): boolean;
    set enabled(value: boolean);
    /**
     * Replace the entry list in place. Used by `updateOptions` so that
     * existing palette references (held by chips, indicators, etc.) see
     * the new palette without needing to be re-wired.
     */
    setEntries(entries: readonly DockviewTabGroupColorEntry[]): void;
    entries(): readonly DockviewTabGroupColorEntry[];
    has(id: string): boolean;
    get(id: string): DockviewTabGroupColorEntry | undefined;
    /** First entry's id; used as the default when a color is unset. */
    defaultId(): string | undefined;
    /**
     * Resolve a stored color to its CSS value, or undefined if no value
     * should be written (palette disabled, or color empty/undefined).
     */
    resolveValue(color: string | undefined): string | undefined;
}
/**
 * Set the `--dv-tab-group-color` custom property on `el` to the resolved
 * accent value, or remove it when the palette is disabled / color is unset.
 */
export declare function applyTabGroupAccent(el: HTMLElement, color: string | undefined, palette: TabGroupColorPalette | undefined): void;
/**
 * Return the resolved CSS color for a tab group, or undefined when the
 * palette is disabled or no color is set. Use this when you need the raw
 * value to assign to a non-custom-property style (e.g. SVG stroke,
 * backgroundColor on the indicator underline).
 */
export declare function resolveTabGroupAccent(color: string | undefined, palette: TabGroupColorPalette | undefined): string | undefined;
