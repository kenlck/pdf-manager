import * as pdfjs from "pdfjs-dist";
import type { Rotation } from "../domain/types";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const docCache = new Map<string, Promise<pdfjs.PDFDocumentProxy>>();

async function getDocument(
  sourceId: string,
  bytes: Uint8Array,
): Promise<pdfjs.PDFDocumentProxy> {
  let pending = docCache.get(sourceId);
  if (!pending) {
    const data = bytes.slice();
    pending = pdfjs.getDocument({ data }).promise;
    docCache.set(sourceId, pending);
  }
  return pending;
}

export function clearRenderCache(sourceId?: string): void {
  if (sourceId) {
    docCache.delete(sourceId);
    return;
  }
  docCache.clear();
}

export async function renderPageToCanvas(
  sourceId: string,
  bytes: Uint8Array,
  pageIndex: number,
  canvas: HTMLCanvasElement,
  options: { scale: number; rotation: Rotation; fitWidth?: boolean; pixelRatio?: number; signal?: AbortSignal },
): Promise<void> {
  const doc = await getDocument(sourceId, bytes);
  const page = await doc.getPage(pageIndex + 1);
  if (options.signal?.aborted) return;
  const viewport = page.getViewport({
    scale: options.scale,
    rotation: (page.rotate + options.rotation) % 360,
  });
  // Keep CSS dimensions separate from the high-resolution backing bitmap.
  if (!options.fitWidth) canvas.style.width = `${viewport.width}px`;
  const displayWidth = canvas.getBoundingClientRect().width || viewport.width;
  const outputScale = displayWidth / viewport.width * (options.pixelRatio ?? window.devicePixelRatio ?? 1);
  canvas.width = Math.ceil(viewport.width * outputScale);
  canvas.height = Math.ceil(viewport.height * outputScale);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not get canvas context.");
  }
  const task = page.render({
    canvasContext: context, viewport, canvas,
    transform: [outputScale, 0, 0, outputScale, 0, 0],
  });
  const cancel = () => task.cancel();
  options.signal?.addEventListener("abort", cancel, { once: true });
  try {
    await task.promise;
  } finally {
    options.signal?.removeEventListener("abort", cancel);
  }
}
