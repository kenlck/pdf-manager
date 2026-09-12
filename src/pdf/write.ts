import { PDFDocument, degrees } from "pdf-lib";
import { displayedRectToPdfDrawImage } from "../domain/stampGeometry";
import type { ExportPage, SourceId, StampBytes } from "../domain/types";

export type SourceBytes = Map<SourceId, Uint8Array>;

export async function writePdfFromPlan(
  plan: ExportPage[],
  sourceBytes: SourceBytes,
  stampBytes: StampBytes,
): Promise<Uint8Array> {
  if (plan.length === 0) {
    throw new Error("Cannot write an empty PDF.");
  }

  const loaded = new Map<SourceId, PDFDocument>();
  for (const page of plan) {
    if (loaded.has(page.sourceId)) {
      continue;
    }
    const bytes = sourceBytes.get(page.sourceId);
    if (!bytes) {
      throw new Error(`Missing bytes for source ${page.sourceId}`);
    }
    loaded.set(
      page.sourceId,
      await PDFDocument.load(bytes, { updateMetadata: false }),
    );
  }

  const out = await PDFDocument.create();
  for (const page of plan) {
    const sourceDoc = loaded.get(page.sourceId)!;
    const [copied] = await out.copyPages(sourceDoc, [page.pageIndex]);
    const box = copied.getCropBox();
    for (const stamp of page.stamps) {
      const png = stampBytes.get(stamp.stampId);
      if (!png) {
        throw new Error(`Missing stamp bytes ${stamp.stampId}`);
      }
      const image = await out.embedPng(png);
      const draw = displayedRectToPdfDrawImage(stamp.rect, {
        cropWidth: box.width,
        cropHeight: box.height,
        rotation: page.rotation,
      });
      copied.drawImage(image, {
        x: draw.x,
        y: draw.y,
        width: draw.width,
        height: draw.height,
        rotate: degrees(draw.rotate),
      });
    }
    if (page.rotation !== 0) {
      const current = copied.getRotation().angle;
      copied.setRotation(degrees(current + page.rotation));
    }
    out.addPage(copied);
  }

  return out.save();
}
