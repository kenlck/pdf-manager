import type { MouseEvent } from "react";
import type { PageRef, Source } from "../domain/types";
import { usePageCanvas } from "./usePageCanvas";
import type { PageReorderItemBinding } from "./usePageReorder";

type PageThumbProps = {
  page: PageRef;
  source: Source | undefined;
  bytes: Uint8Array | undefined;
  label: string;
  selected: boolean;
  scale?: number;
  onClick: (event: MouseEvent) => void;
  reorder: PageReorderItemBinding;
};

export function PageThumb(props: PageThumbProps) {
  const canvasRef = usePageCanvas(props.page, props.bytes, props.scale ?? 0.2, true);

  const sourceName = props.source
    ? props.source.path.split(/[/\\]/).pop() ?? props.source.path
    : "unknown";
  const { state } = props.reorder;

  return (
    <button
      type="button"
      className={`page-thumb ${props.selected ? "selected" : ""}`}
      draggable={props.reorder.draggable}
      onDragStart={props.reorder.onDragStart}
      onDragOver={props.reorder.onDragOver}
      onDrop={props.reorder.onDrop}
      onDragEnd={props.reorder.onDragEnd}
      data-reorder-state={state === "idle" ? undefined : state}
      onClick={props.onClick}
      aria-label={props.label}
      data-source={sourceName}
    >
      <canvas ref={canvasRef} />
      <span className="page-thumb-meta">
        <span>{props.label}</span>
        <span className="page-thumb-source">{sourceName}</span>
      </span>
    </button>
  );
}
