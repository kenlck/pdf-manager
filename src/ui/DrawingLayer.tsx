import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import type { MarkupPoint, MarkupTool, Stamp } from "../domain/types";
import { artworkUrl, drawnStamp, type MarkupStyle } from "../markup/artwork";

type Props = { tool: Exclude<MarkupTool, "select">; style: MarkupStyle; onPlace: (stamp: Stamp) => void };
export function DrawingLayer(props: Props) {
  const gesture = useRef<{ pointerId: number; points: MarkupPoint[]; pageHeight: number } | null>(null);
  const [draft, setDraft] = useState<Stamp | null>(null);
  function cancel() { gesture.current = null; setDraft(null); }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") cancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  function point(event: PointerEvent<HTMLDivElement>): MarkupPoint {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(800, (event.clientX - bounds.left) / bounds.width * 800)), y: Math.max(0, Math.min(bounds.height / bounds.width * 800, (event.clientY - bounds.top) / bounds.width * 800)) };
  }
  function append(event: PointerEvent<HTMLDivElement>) {
    const active = gesture.current;
    if (!active || event.pointerId !== active.pointerId) return null;
    const next = point(event);
    const last = active.points[active.points.length - 1];
    if (next.x !== last.x || next.y !== last.y) active.points.push(next);
    return drawnStamp(props.tool, active.points, active.pageHeight, props.style);
  }
  return <div className="drawing-layer" aria-label={`${props.tool} drawing area`}
    onPointerDown={(event) => {
      if (event.button !== 0 || gesture.current) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      gesture.current = { pointerId: event.pointerId, points: [point(event)], pageHeight: bounds.height / bounds.width * 800 };
    }}
    onPointerMove={(event) => { const next = append(event); if (next) setDraft(next); }}
    onPointerUp={(event) => {
      const active = gesture.current;
      const stamp = append(event);
      if (!stamp || !active) return;
      if (props.tool === "pencil" || active.points.length > 1) props.onPlace(stamp);
      cancel();
      event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onPointerCancel={cancel} onLostPointerCapture={cancel}>
    {draft?.content && <img alt="" draggable={false} src={artworkUrl(draft.content)} style={{ position: "absolute", left: `${draft.rect.x * 100}%`, top: `${draft.rect.y * 100}%`, width: `${draft.rect.w * 100}%`, height: `${draft.rect.h * 100}%` }} />}
  </div>;
}
