import { DropTargetTargetModel, DroptargetOverlayModel, Position } from './droptarget';
export interface OverlayElements {
    dropzone: HTMLElement;
    selection: HTMLElement;
}
export declare function createOverlayElements(): OverlayElements;
export declare function renderInPlaceOverlay(overlay: HTMLElement, quadrant: Position, width: number, height: number, overlayModel?: DroptargetOverlayModel): void;
/** `boundsChanged: false` lets callers skip redundant work on tight drag loops. */
export declare function renderAnchoredOverlay(args: {
    outlineElement: HTMLElement;
    targetModel: DropTargetTargetModel;
    quadrant: Position;
    width: number;
    height: number;
    overlayModel?: DroptargetOverlayModel;
    className?: string;
}): {
    boundsChanged: boolean;
    targetChanged: boolean;
};
