import { useEffect, useRef } from "react";
import type { DragEvent, MouseEvent } from "react";
import type { PageRef, Source } from "../domain/types";
import { renderPageToCanvas } from "../pdf/render";

type PageThumbProps = {
  page: PageRef;
  source: Source | undefined;
  bytes: Uint8Array | undefined;
  label: string;
  selected: boolean;
  scale?: number;
  onClick: (event: MouseEvent) => void;
  draggable?: boolean;
  onDragStart?: (event: DragEvent) => void;
  onDragOver?: (event: DragEvent) => void;
  onDrop?: (event: DragEvent) => void;
};

export function PageThumb(props: PageThumbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scale = props.scale ?? 0.2;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !props.bytes) {
      return;
    }
    let cancelled = false;
    void renderPageToCanvas(
      props.page.sourceId,
      props.bytes,
      props.page.pageIndex,
      canvas,
      { scale, rotation: props.page.rotation },
    ).catch(() => {
      if (!cancelled && canvasRef.current) {
        const ctx = canvasRef.current.getContext("2d");
        ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [props.bytes, props.page, scale]);

  const sourceName = props.source
    ? props.source.path.split(/[/\\]/).pop() ?? props.source.path
    : "unknown";

  return (
    <button
      type="button"
      className={`page-thumb ${props.selected ? "selected" : ""}`}
      onClick={props.onClick}
      draggable={props.draggable}
      onDragStart={props.onDragStart}
      onDragOver={props.onDragOver}
      onDrop={props.onDrop}
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
