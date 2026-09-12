import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  MIN_NORM_SIDE,
  aspectFromPixelSize,
  displayNormRect,
  rectsEqual,
} from "../domain/stampGeometry";
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

function pngAspect(bytes: Uint8Array): number {
  if (bytes.length < 24) {
    return 2.5;
  }
  const width =
    ((bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]) >>> 0;
  const height =
    ((bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>> 0;
  return aspectFromPixelSize({ width, height });
}

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
  const [urls, setUrls] = useState<Map<StampId, string>>(() => new Map());
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [draftRect, setDraftRect] = useState<DisplayNormRect | null>(null);

  useEffect(() => {
    const next = new Map<StampId, string>();
    for (const [id, bytes] of props.stampBytes) {
      next.set(id, URL.createObjectURL(new Blob([bytes], { type: "image/png" })));
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
    if (!props.interactive) {
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
    if (!props.interactive) {
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
    if (!props.interactive) {
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
    const bytes = props.stampBytes.get(gesture.stampId);
    const aspect = bytes ? pngAspect(bytes) : 2.5;
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
      onPointerCancel={onPointerUp}
    >
      {props.stamps.map((stamp) => {
        const rect = paintedRect(stamp);
        const selected = props.selectedStampId === stamp.id;
        const src = urls.get(stamp.id);
        return (
          <div
            key={stamp.id}
            className={`stamp${selected ? " selected" : ""}`}
            style={{
              left: `${rect.x * 100}%`,
              top: `${rect.y * 100}%`,
              width: `${rect.w * 100}%`,
              height: `${rect.h * 100}%`,
            }}
            onPointerDown={(event) => onStampPointerDown(event, stamp)}
          >
            {src ? <img src={src} alt="" draggable={false} /> : null}
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
