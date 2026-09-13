import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  MIN_NORM_SIDE,
  displayNormRect,
  rectsEqual,
} from "../domain/stampGeometry";
import { artworkUrl } from "../markup/artwork";
import type { DisplayNormRect, Stamp, StampBytes, StampId } from "../domain/types";

type Point = { x: number; y: number };

type Corner = "nw" | "ne" | "sw" | "se";

type Gesture =
  | { kind: "move"; stampId: StampId; origin: DisplayNormRect; start: Point }
  | {
      kind: "resize";
      stampId: StampId;
      origin: DisplayNormRect;
      corner: Corner;
      start: Point;
    };

type StampLayerProps = {
  stamps: readonly Stamp[];
  stampBytes: StampBytes;
  selectedStampId: StampId | null;
  interactive: boolean;
  onSelect?: (stampId: StampId) => void;
  onCommit?: (stampId: StampId, rect: DisplayNormRect) => void;
  onSelectPage?: () => void;
};

function clientToNorm(
  event: PointerEvent | ReactPointerEvent,
  el: HTMLElement,
): Point {
  const bounds = el.getBoundingClientRect();
  if (bounds.width === 0 || bounds.height === 0) {
    return { x: 0, y: 0 };
  }
  return {
    x: (event.clientX - bounds.left) / bounds.width,
    y: (event.clientY - bounds.top) / bounds.height,
  };
}

function applyMove(origin: DisplayNormRect, start: Point, point: Point): DisplayNormRect {
  return displayNormRect({
    x: origin.x + (point.x - start.x),
    y: origin.y + (point.y - start.y),
    w: origin.w,
    h: origin.h,
  });
}

function applyResize(
  origin: DisplayNormRect,
  corner: Corner,
  point: Point,
  aspect: number,
): DisplayNormRect {
  const ratio = aspect > 0 ? aspect : 2.5;
  const anchorX = corner === "nw" || corner === "sw" ? origin.x + origin.w : origin.x;
  const anchorY = corner === "nw" || corner === "ne" ? origin.y + origin.h : origin.y;
  let w = Math.abs(point.x - anchorX);
  if (w < MIN_NORM_SIDE) {
    w = MIN_NORM_SIDE;
  }
  let h = w / ratio;
  if (h < MIN_NORM_SIDE) {
    h = MIN_NORM_SIDE;
    w = h * ratio;
  }
  const x = corner === "nw" || corner === "sw" ? anchorX - w : anchorX;
  const y = corner === "nw" || corner === "ne" ? anchorY - h : anchorY;
  return displayNormRect({ x, y, w, h });
}

export function StampLayer(props: StampLayerProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);
  const [urls, setUrls] = useState<Map<StampId, string>>(() => new Map());
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [draftRect, setDraftRect] = useState<DisplayNormRect | null>(null);

  useEffect(() => {
    if (props.interactive) selectedRef.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [props.selectedStampId, props.interactive]);

  useEffect(() => {
    const next = new Map<StampId, string>();
    for (const [id, bytes] of props.stampBytes) {
      next.set(id, URL.createObjectURL(new Blob([bytes], { type: bytes[0] === 0xff ? "image/jpeg" : "image/png" })));
    }
    setUrls(next);
    return () => {
      for (const url of next.values()) {
        URL.revokeObjectURL(url);
      }
    };
  }, [props.stampBytes]);

  function paintedRect(stamp: Stamp): DisplayNormRect {
    if (gesture && gesture.stampId === stamp.id && draftRect) {
      return draftRect;
    }
    return stamp.rect;
  }

  function onLayerPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!props.interactive || event.button !== 0) {
      return;
    }
    if (event.target !== event.currentTarget) {
      return;
    }
    props.onSelectPage?.();
  }

  function onStampPointerDown(
    event: ReactPointerEvent<HTMLDivElement>,
    stamp: Stamp,
  ) {
    if (!props.interactive || event.button !== 0) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    props.onSelect?.(stamp.id);
    const layer = layerRef.current;
    if (!layer) {
      return;
    }
    layer.setPointerCapture(event.pointerId);
    setGesture({
      kind: "move",
      stampId: stamp.id,
      origin: stamp.rect,
      start: clientToNorm(event, layer),
    });
    setDraftRect(stamp.rect);
  }

  function onHandlePointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
    stamp: Stamp,
    corner: Corner,
  ) {
    if (!props.interactive || event.button !== 0) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    props.onSelect?.(stamp.id);
    const layer = layerRef.current;
    if (!layer) {
      return;
    }
    layer.setPointerCapture(event.pointerId);
    setGesture({
      kind: "resize",
      stampId: stamp.id,
      origin: stamp.rect,
      corner,
      start: clientToNorm(event, layer),
    });
    setDraftRect(stamp.rect);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!gesture || !layerRef.current) {
      return;
    }
    const point = clientToNorm(event, layerRef.current);
    if (gesture.kind === "move") {
      setDraftRect(applyMove(gesture.origin, gesture.start, point));
      return;
    }
    const aspect = gesture.origin.w / gesture.origin.h;
    setDraftRect(applyResize(gesture.origin, gesture.corner, point, aspect));
  }

  function onPointerUp() {
    if (!gesture || !draftRect) {
      setGesture(null);
      setDraftRect(null);
      return;
    }
    const stamp = props.stamps.find((item) => item.id === gesture.stampId);
    const committed = stamp?.rect ?? gesture.origin;
    if (!rectsEqual(draftRect, committed)) {
      props.onCommit?.(gesture.stampId, draftRect);
    }
    setGesture(null);
    setDraftRect(null);
  }

  return (
    <div
      ref={layerRef}
      className={`stamp-layer${props.interactive ? "" : " read-only"}`}
      onPointerDown={onLayerPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { setGesture(null); setDraftRect(null); }}
      onLostPointerCapture={() => { setGesture(null); setDraftRect(null); }}
    >
      {props.stamps.map((stamp) => {
        const rect = paintedRect(stamp);
        const selected = props.selectedStampId === stamp.id;
        const src = stamp.content ? artworkUrl(stamp.content) : urls.get(stamp.id);
        const rotation = stamp.rotation ?? 0;
        const swapped = rotation === 90 || rotation === 270;
        return (
          <div
            key={stamp.id}
            ref={selected ? selectedRef : undefined}
            className={`stamp${selected ? " selected" : ""}`}
            style={{
              left: `${rect.x * 100}%`,
              top: `${rect.y * 100}%`,
              width: `${rect.w * 100}%`,
              height: `${rect.h * 100}%`,
            }}
            role={props.interactive ? "button" : undefined}
            tabIndex={props.interactive ? 0 : undefined}
            aria-label={props.interactive ? `Select ${stamp.label ?? stamp.content?.kind ?? "signature"}` : undefined}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); props.onSelect?.(stamp.id); } }}
            onPointerDown={(event) => onStampPointerDown(event, stamp)}
          >
            {src ? <img src={src} alt={stamp.content?.kind === "text" ? stamp.content.text : stamp.label ?? stamp.content?.kind ?? "Signature"} draggable={false}
              style={swapped ? { position: "absolute", left: "50%", top: "50%", width: "100cqh", height: "100cqw", transform: `translate(-50%, -50%) rotate(${rotation}deg)` } : { transform: `rotate(${rotation}deg)` }} /> : null}
            {props.interactive && selected ? (
              <>
                {(["nw", "ne", "sw", "se"] satisfies readonly Corner[]).map((corner) => (
                  <button
                    key={corner}
                    type="button"
                    className={`stamp-handle ${corner}`}
                    aria-label={`Resize ${corner}`}
                    onPointerDown={(event) =>
                      onHandlePointerDown(event, stamp, corner)
                    }
                  />
                ))}
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
