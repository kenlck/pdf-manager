import { PDFDict, PDFDocument, PDFName, StandardFonts, degrees, rgb } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import { displayedRectToPdfDrawImage, displayNormRect } from "../domain/stampGeometry";
import { asSourceId, asStampId, type MarkupContent } from "../domain/types";
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
  it.each([90, -270])("exports mixed artwork in stacking order on cropped pages rotated %s degrees", async (initialRotation) => {
    const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
    const doc = await PDFDocument.create();
    const sourcePage = doc.addPage([600, 800]);
    sourcePage.setCropBox(20, 30, 400, 600);
    sourcePage.setRotation(degrees(initialRotation));
    const content: MarkupContent[] = [
      { kind: "text", text: "Edited 中文", color: "#123456", width: 200, height: 40, fontSize: 24 },
      { kind: "rectangle", color: "#123456", width: 200, height: 40, strokeWidth: 3, fill: "none" },
      { kind: "ellipse", color: "#123456", width: 200, height: 40, strokeWidth: 3, fill: "#abcdef" },
      { kind: "line", color: "#123456", width: 200, height: 40, strokeWidth: 3, points: [{ x: 0, y: 0 }, { x: 200, y: 40 }] },
      { kind: "pencil", color: "#123456", width: 200, height: 40, strokeWidth: 3, points: [{ x: 10, y: 10 }] },
    ];
    const rasterize = vi.fn(async (_content: MarkupContent, _width: number, _height: number) => png);
    const id = asSourceId("mixed");
    const rect = displayNormRect({ x: 0.1, y: 0.2, w: 0.3, h: 0.1 });
    const output = await writePdfFromPlan([{ sourceId: id, pageIndex: 0, rotation: 90, stamps: [
      { stampId: asStampId("image"), rect },
      ...content.map((item, i) => ({ stampId: asStampId(`markup-${i}`), content: item, rect, rotation: 90 as const })),
    ] }], new Map([[id, await doc.save()]]), new Map([[asStampId("image"), png]]), rasterize);
    const saved = await PDFDocument.load(output);
    expect(saved.getPages()[0].getRotation().angle).toBe(180);
    expect(saved.getPages()[0].getCropBox()).toEqual({ x: 20, y: 30, width: 400, height: 600 });
    expect(rasterize.mock.calls.map((call) => call[0])).toEqual(content);
    expect(rasterize).toHaveBeenNthCalledWith(1, content[0], 60, 120);
    expect(saved.getPages()[0].node.Resources()?.lookup(PDFName.of("XObject"), PDFDict).keys()).toHaveLength(6);
  });
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
      new Map(),
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
      new Map(),
    );
    const out = await PDFDocument.load(outBytes);
    expect(out.getPageCount()).toBe(4);
    expect(asSourceId(a.source.id)).toBe(a.source.id);
  });

  it("embeds a stamp PNG as an XObject", async () => {
    resetSourceCounter();
    const png = Uint8Array.from(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      ),
    );
    const sourceBytes = await makeDoc(["A0"]);
    const opened = await openPdf(sourceBytes, "/tmp/a.pdf");
    expect(opened.ok).toBe(true);
    if (!opened.ok) {
      return;
    }
    const stampId = asStampId("stamp-1");
    const rect = displayNormRect({ x: 0.1, y: 0.1, w: 0.2, h: 0.15 });
    const draw = displayedRectToPdfDrawImage(rect, {
      cropWidth: 200,
      cropHeight: 200,
      rotation: 0,
    });
    expect(draw.y).toBe(200 - 20 - 30);
    expect(draw.rotate).toBe(0);
    const outBytes = await writePdfFromPlan(
      [
        {
          sourceId: opened.source.id,
          pageIndex: 0,
          rotation: 0,
          stamps: [{ stampId, rect }],
        },
      ],
      new Map([[opened.source.id, opened.bytes]]),
      new Map([[stampId, png]]),
    );
    const out = await PDFDocument.load(outBytes);
    const resources = out.getPages()[0].node.Resources();
    const xObject = resources?.lookup(PDFName.of("XObject"), PDFDict);
    expect(xObject).toBeDefined();
    expect(xObject?.keys().length).toBeGreaterThan(0);
  });

  it("throws when stamp bytes are missing", async () => {
    resetSourceCounter();
    const sourceBytes = await makeDoc(["A0"]);
    const opened = await openPdf(sourceBytes, "/tmp/a.pdf");
    expect(opened.ok).toBe(true);
    if (!opened.ok) {
      return;
    }
    const stampId = asStampId("stamp-missing");
    await expect(
      writePdfFromPlan(
        [
          {
            sourceId: opened.source.id,
            pageIndex: 0,
            rotation: 0,
            stamps: [
              {
                stampId,
                rect: displayNormRect({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }),
              },
            ],
          },
        ],
        new Map([[opened.source.id, opened.bytes]]),
        new Map(),
      ),
    ).rejects.toThrow(`Missing stamp bytes ${stampId}`);
  });
});
