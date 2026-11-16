/**
 * Maps dockview options to the modules that implement them, so setting an
 * option for an absent module reports which module is missing instead of
 * silently doing nothing.
 *
 * This is the "declared intent" diagnostic. It fires when the user asks for a
 * feature via options, at construction and on every `updateOptions`. It
 * deliberately does *not* fire on user interaction: an interaction reaching an
 * absent module stays silent, because the `?.` service-slot call sites can't
 * tell a missing module from a feature the app never wanted.
 *
 * Rules are a flat list rather than a `Record<keyof DockviewOptions, ...>`
 * because dockview's options are nested and value-gated: `overflow.mode:
 * 'wrap'` needs MultiRowTabs while `overflow.search` needs AdvancedOverflow,
 * so one top-level key maps to several modules depending on its contents. A
 * rule per gated thing also lets `reason` name the exact path the user set,
 * which is the whole point of the message.
 *
 * ## Adding a rule
 *
 * A rule is just "this option needs that module". Whether that makes it paid is
 * not a judgement call: a module is enterprise iff it ships in
 * `dockview-enterprise`'s `Modules` list. {@link ENTERPRISE_MODULE_NAMES}
 * mirrors that list, and a test in dockview-enterprise fails if the two drift,
 * so naming the right module is the only thing you have to get right here.
 *
 * The one trap is picking the module. Don't infer it from what core does at
 * runtime: a core fallback that hands a paid feature to free builds would read
 * as "the option is free" and turn one bug into two. Pick the module that
 * *implements the documented feature*; if core also does it, that is a leak to
 * fix in core, not a reason to drop the rule.
 */
import { DockviewComponentOptions } from './options';
export interface OptionModuleRule {
    /**
     * The top-level option this rule gates on. Several rules may share one key
     * (`overflow` gates both MultiRowTabs and AdvancedOverflow); `reason` carries
     * the precise path. Kept separate from `reason` so the completeness test in
     * dockview-enterprise can match rules to the options each module declares
     * without parsing prose.
     */
    optionKey: keyof DockviewComponentOptions;
    /**
     * How the user expressed intent, quoted verbatim into the message. Name
     * the exact option path and value, e.g. `overflow.mode: 'wrap'`.
     */
    reason: string;
    /** The module that implements it. */
    moduleName: string;
    /**
     * Whether `options` requests the feature. Receives the options the caller
     * passed, never the merged set: every key of `DockviewOptions` is present
     * (as `undefined`) on the merged object, so a presence test there is always
     * true. An option left out, `undefined`, or explicitly disabled must return
     * false: silence is correct for a feature nobody asked for.
     */
    when: (options: Partial<DockviewComponentOptions>) => boolean;
}
export declare const OPTION_MODULE_RULES: OptionModuleRule[];
/**
 * Reports any option in `options` whose module isn't registered. Never throws.
 *
 * Reasons are grouped so each missing module produces exactly one message, however
 * many of its options were set: `overflow: { mode: 'wrap', maxRows: 3 }` names
 * both paths in a single MultiRowTabs error rather than repeating the install
 * instructions twice. Logging is deduplicated per module+reasons (see
 * `logMissingModule`), so re-validating on every `updateOptions` stays quiet.
 *
 * Pass the options the caller supplied, not the merged set; see
 * {@link OptionModuleRule.when}.
 */
export declare function validateOptionModules(options: Partial<DockviewComponentOptions>, isModuleRegistered: (moduleName: string) => boolean): void;
