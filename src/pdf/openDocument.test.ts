import { PDFDocument } from "pdf-lib";
import { expect, it } from "vitest";
import { openDocument } from "./openDocument";
import { writePdfFromPlan } from "./write";

const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));

it("turns an image into one exportable page containing the image", async () => {
  const result = await openDocument(png, "photo.png");
  if (!result.ok) throw new Error(result.error.message);
  expect(result.source.path).toBe("photo.png");
  expect(result.source.pageCount).toBe(1);
  const output = await writePdfFromPlan(
    [{ sourceId: result.source.id, pageIndex: 0, rotation: 0, stamps: [] }],
    new Map([[result.source.id, result.bytes]]), new Map(),
  );
  const doc = await PDFDocument.load(output);
  expect(doc.getPageCount()).toBe(1);
  expect(doc.getPage(0).getSize()).toEqual({ width: 1, height: 1 });
  expect(doc.getPage(0).node.Resources()?.toString()).toContain("/Image-");
});

it("reports corrupt images as import errors", async () => {
  const result = await openDocument(new Uint8Array([1, 2, 3]), "broken.jpg");
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.message).toContain("image could not be read");
});
