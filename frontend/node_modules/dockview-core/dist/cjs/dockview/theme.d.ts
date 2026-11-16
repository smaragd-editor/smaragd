import { TabAnimation } from './options';
export type DockviewTabGroupIndicator = 'wrap' | 'none';
export interface DockviewTheme {
    /**
     *  The name of the theme
     */
    name: string;
    /**
     * The class name to apply to the theme containing the CSS variables settings.
     */
    className: string;
    /**
     * Whether the theme is light or dark. Useful for adapting panel content colors.
     */
    colorScheme?: 'light' | 'dark';
    /**
     * The gap between the groups
     */
    gap?: number;
    /**
     * The collapsed size (in px) for edge groups when using this theme.
     * When set, this overrides the default 35px collapsed size so that
     * collapsed edge groups match the theme's tab strip height.
     */
    edgeGroupCollapsedSize?: number;
    /**
     * The mouting position of the overlay shown when dragging a panel. `absolute`
     * will mount the overlay to root of the dockview component whereas `relative` will mount the overlay to the group container.
     */
    dndOverlayMounting?: 'absolute' | 'relative';
    /**
     * When dragging a panel, the overlay can either encompass the panel contents or the entire group including the tab header space.
     */
    dndPanelOverlay?: 'content' | 'group';
    /**
     * The style of the drop indicator shown when dragging a tab over another tab.
     * `'line'` renders a thin 4px insertion strip at the tab edge (suited to bordered/spaced themes).
     * `'fill'` renders a half-width highlighted area (suited to themes that use a background fill).
     * Defaults to `'fill'`.
     */
    dndTabIndicator?: 'line' | 'fill';
    /**
     * The CSS value applied to `--dv-drag-over-border` when this theme is active.
     * For example `'2px solid var(--dv-active-sash-color)'`.
     * When unset the CSS variable is left to the stylesheet default (`none`).
     */
    dndOverlayBorder?: string;
    /**
     * Controls how tab groups are visually indicated in the tab bar.
     *
     * - `'wrap'` (default): Chrome-style SVG underline that wraps around the active tab
     *   with rounded corners. Requires JavaScript for positioning and path computation.
     * - `'none'`: Flat continuous colored bar spanning the full tab group width.
     *   Unlike `'wrap'`, the bar does not curve around the active tab.
     */
    tabGroupIndicator?: DockviewTabGroupIndicator;
    /**
     * Controls tab drag-and-drop reorder animation style.
     *
     * - `"smooth"`: tabs animate smoothly during drag-and-drop reorder. They
     *   slide apart to reveal the insertion gap, then animate to their
     *   final positions on drop (Chrome-like behavior).
     * - `"default"`: standard tab reorder behavior without animation.
     *
     * Defaults to `"default"`.
     */
    tabAnimation?: TabAnimation;
}
export declare const themeDark: DockviewTheme;
export declare const themeLight: DockviewTheme;
export declare const themeVisualStudio: DockviewTheme;
export declare const themeAbyss: DockviewTheme;
export declare const themeDracula: DockviewTheme;
export declare const themeAbyssSpaced: DockviewTheme;
export declare const themeLightSpaced: DockviewTheme;
export declare const themeNord: DockviewTheme;
export declare const themeNordSpaced: DockviewTheme;
export declare const themeCatppuccinMocha: DockviewTheme;
export declare const themeCatppuccinMochaSpaced: DockviewTheme;
export declare const themeMonokai: DockviewTheme;
export declare const themeSolarizedLight: DockviewTheme;
export declare const themeSolarizedLightSpaced: DockviewTheme;
export declare const themeGithubDark: DockviewTheme;
export declare const themeGithubDarkSpaced: DockviewTheme;
export declare const themeGithubLight: DockviewTheme;
export declare const themeGithubLightSpaced: DockviewTheme;
