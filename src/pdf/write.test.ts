import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { asSourceId } from "../domain/types";
import { openPdf, resetSourceCounter } from "./openPdf";
import { writePdfFromPlan } from "./write";

async function makeDoc(labels: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const label of labels) {
    const page = doc.addPage([200, 200]);
    page.drawText(label, { x: 20, y: 100, size: 18, font, color: rgb(0, 0, 0) });
  }
  return doc.save();
}

describe("pdf open and write", () => {
  it("rejects non-pdf bytes", async () => {
    resetSourceCounter();
    const result = await openPdf(new TextEncoder().encode("hello"), "/tmp/x.txt");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("notPdf");
    }
  });

  it("writes pages from two sources in plan order", async () => {
    resetSourceCounter();
    const aBytes = await makeDoc(["A0", "A1"]);
    const bBytes = await makeDoc(["B0"]);
    const a = await openPdf(aBytes, "/tmp/a.pdf");
    const b = await openPdf(bBytes, "/tmp/b.pdf");
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) {
      return;
    }
    const outBytes = await writePdfFromPlan(
      [
        { sourceId: b.source.id, pageIndex: 0, rotation: 0, stamps: [] },
        { sourceId: a.source.id, pageIndex: 0, rotation: 0, stamps: [] },
      ],
      new Map([
        [a.source.id, a.bytes],
        [b.source.id, b.bytes],
      ]),
    );
    const out = await PDFDocument.load(outBytes);
    expect(out.getPageCount()).toBe(2);
  });

  it("copies pages from two documents for combine export", async () => {
    resetSourceCounter();
    const aBytes = await makeDoc(["A0", "A1", "A2"]);
    const bBytes = await makeDoc(["B0", "B1"]);
    const a = await openPdf(aBytes, "/tmp/a.pdf");
    const b = await openPdf(bBytes, "/tmp/b.pdf");
    if (!a.ok || !b.ok) {
      throw new Error("fixtures failed");
    }
    const outBytes = await writePdfFromPlan(
      [
        { sourceId: a.source.id, pageIndex: 0, rotation: 0, stamps: [] },
        { sourceId: a.source.id, pageIndex: 2, rotation: 0, stamps: [] },
        { sourceId: b.source.id, pageIndex: 0, rotation: 0, stamps: [] },
        { sourceId: b.source.id, pageIndex: 1, rotation: 0, stamps: [] },
      ],
      new Map([
        [a.source.id, a.bytes],
        [b.source.id, b.bytes],
      ]),
    );
    const out = await PDFDocument.load(outBytes);
    expect(out.getPageCount()).toBe(4);
    expect(asSourceId(a.source.id)).toBe(a.source.id);
  });
});
