import { Position } from '../dnd/droptarget';
/**
 * The full set of localisable strings dockview speaks to assistive technology:
 * the LiveRegion announcements and the keyboard-docking narration. Each entry
 * returns the complete sentence so a translator owns wording *and* word order.
 *
 * Override any subset via the `messages` option; unset entries keep the
 * English defaults below. For fine-grained, per-event announcement overrides
 * (with access to the panel) use `getAnnouncement`, which takes precedence.
 */
export interface DockviewMessages {
    panelOpened(title: string): string;
    panelClosed(title: string): string;
    groupMaximized(title: string): string;
    groupRestored(title: string): string;
    groupFloated(title: string): string;
    groupDocked(title: string): string;
    groupPoppedOut(title: string): string;
    /** Accessible name for a tab's close button, qualified with the panel title. */
    closeTab(title: string): string;
    /** Accessible name for a tab's close button when the panel has no title. */
    closeTabPlain(): string;
    /** Target phase: which group is highlighted, and how to proceed. */
    movePickTarget(source: string, target: string, current: number, total: number): string;
    /** Edge phase: which drop position is selected, and how to proceed. */
    movePickEdge(position: Position, target: string): string;
    /** A move committed. */
    moveCommitted(source: string, target: string, position: Position): string;
    /** A move cancelled with Escape. */
    moveCancelled(): string;
    /** A move the layout rejected. */
    moveNotAllowed(): string;
    /** The panel was floated as a terminal move action. */
    moveFloated(source: string): string;
}
export declare const DEFAULT_MESSAGES: DockviewMessages;
/** Merge an app's partial overrides over the English defaults. */
export declare function resolveMessages(overrides?: Partial<DockviewMessages>): DockviewMessages;
