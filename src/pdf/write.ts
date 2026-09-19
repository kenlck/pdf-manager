import { PDFDocument, degrees } from "pdf-lib";
import { displayedRectToPdfDrawImage, rotatedArtworkDraw } from "../domain/stampGeometry";
import type { ExportPage, Rotation, SourceId, StampBytes } from "../domain/types";
import { rasterizeArtwork } from "../markup/artwork";
import { outlineSourcePages } from "./outline";

export type SourceBytes = Map<SourceId, Uint8Array>;

export async function writePdfFromPlan(
  plan: ExportPage[],
  sourceBytes: SourceBytes,
  stampBytes: StampBytes,
  renderArtwork = rasterizeArtwork,
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

  const pagesBySource = new Map<SourceId, number[]>();
  for (const page of plan) {
    const indices = pagesBySource.get(page.sourceId);
    if (indices) indices.push(page.pageIndex);
    else pagesBySource.set(page.sourceId, [page.pageIndex]);
  }
  for (const [sourceId, indices] of pagesBySource) {
    await outlineSourcePages(loaded.get(sourceId)!, indices);
  }

  const out = await PDFDocument.create();
  for (const page of plan) {
    const sourceDoc = loaded.get(page.sourceId)!;
    const [copied] = await out.copyPages(sourceDoc, [page.pageIndex]);
    const box = copied.getCropBox();
    const rotation = (((copied.getRotation().angle + page.rotation) % 360 + 360) % 360) as Rotation;
    for (const stamp of page.stamps) {
      const draw = rotatedArtworkDraw(displayedRectToPdfDrawImage(stamp.rect, {
        cropWidth: box.width,
        cropHeight: box.height,
        rotation,
      }), stamp.rotation ?? 0);
      const bytes = stamp.content
        ? await renderArtwork(stamp.content, draw.width, draw.height)
        : stampBytes.get(stamp.stampId);
      if (!bytes) throw new Error(`Missing stamp bytes ${stamp.stampId}`);
      const image = bytes[0] === 0xff ? await out.embedJpg(bytes) : await out.embedPng(bytes);
      copied.drawImage(image, {
        x: draw.x + box.x,
        y: draw.y + box.y,
        width: draw.width,
        height: draw.height,
        rotate: degrees(draw.rotate),
      });
    }
    copied.setRotation(degrees(rotation));
    out.addPage(copied);
  }

  return out.save();
}
