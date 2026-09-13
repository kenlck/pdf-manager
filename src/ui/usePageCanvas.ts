import { useEffect, useRef } from "react";
import type { PageRef } from "../domain/types";
import { renderPageToCanvas } from "../pdf/render";

export function usePageCanvas(page: PageRef | null, bytes: Uint8Array | undefined, scale: number, fitWidth = false) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !page || !bytes) return;
    let controller: AbortController | undefined;
    let pending = Promise.resolve();
    let lastWidth = -1;
    let lastRatio = -1;
    const update = () => {
      const width = canvas.parentElement?.clientWidth ?? 0;
      const ratio = window.devicePixelRatio || 1;
      if (width === lastWidth && ratio === lastRatio) return;
      lastWidth = width;
      lastRatio = ratio;
      controller?.abort();
      const next = new AbortController();
      controller = next;
      pending = pending.then(async () => {
        if (next.signal.aborted) return;
        await renderPageToCanvas(page.sourceId, bytes, page.pageIndex, canvas, {
          scale, rotation: page.rotation, fitWidth, pixelRatio: ratio, signal: next.signal,
        });
      }).catch(() => {
        // A newer render may cancel this one; keep the last preview until ready.
      });
    };
    const observer = new ResizeObserver(update);
    if (canvas.parentElement) observer.observe(canvas.parentElement);
    window.addEventListener("resize", update);
    update();
    return () => {
      controller?.abort();
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [page?.sourceId, page?.pageIndex, page?.rotation, bytes, scale, fitWidth]);

  return canvasRef;
}
