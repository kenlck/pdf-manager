import { PDFDocument, degrees } from "pdf-lib";
import type { ExportPage } from "../domain/types";
import type { SourceId } from "../domain/types";

export type SourceBytes = Map<SourceId, Uint8Array>;

export async function writePdfFromPlan(
  plan: ExportPage[],
  sourceBytes: SourceBytes,
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
    if (page.rotation !== 0) {
      const current = copied.getRotation().angle;
      copied.setRotation(degrees(current + page.rotation));
    }
    out.addPage(copied);
  }

  return out.save();
}
