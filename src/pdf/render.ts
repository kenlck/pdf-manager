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
  options: { scale: number; rotation: Rotation },
): Promise<void> {
  const doc = await getDocument(sourceId, bytes);
  const page = await doc.getPage(pageIndex + 1);
  const viewport = page.getViewport({
    scale: options.scale,
    rotation: options.rotation,
  });
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not get canvas context.");
  }
  await page.render({ canvasContext: context, viewport, canvas }).promise;
}
