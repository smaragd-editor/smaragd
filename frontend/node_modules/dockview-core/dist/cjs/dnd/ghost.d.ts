export declare function addGhostImage(dataTransfer: DataTransfer, ghostElement: HTMLElement, options?: {
    x?: number;
    y?: number;
    ownerDocument?: Document;
    /** The drag source. When it is inside a shadow root the ghost is
     *  appended there, so the styles scoped to that root apply. */
    owner?: Node;
}): void;
