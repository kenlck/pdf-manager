import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDict, PDFDocument, PDFName, StandardFonts, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { describe, expect, it } from "vitest";
import { asSourceId } from "../../domain/types";
import { findLiveText, outlineAllText } from "./index";
import { writePdfFromPlan } from "../write";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("outlineAllText", () => {
  it("outlines Type0 Identity-H embedded fonts", async () => {
    const source = await PDFDocument.create();
    source.registerFontkit(fontkit);
    const font = await source.embedFont(await readFile(path.join(root, "src/pdf/fonts/Arimo-Regular.ttf")));
    const page = source.addPage([200, 200]);
    page.drawText("Hello", { x: 20, y: 100, size: 18, font, color: rgb(0, 0, 0) });
    const id = asSourceId("type0");
    const out = await writePdfFromPlan(
      [{ sourceId: id, pageIndex: 0, rotation: 0, stamps: [] }],
      new Map([[id, await source.save()]]),
      new Map(),
    );
    const saved = await PDFDocument.load(out);
    expect(findLiveText(saved)).toEqual({ showing: [], fontResources: [] });
    const xobjects = saved.getPages()[0].node.Resources()?.lookup(PDFName.of("XObject"), PDFDict);
    expect(xobjects?.keys().length).toBeGreaterThan(0);
  });

  it("outlines text inside a form XObject", async () => {
    const inner = await PDFDocument.create();
    const font = await inner.embedFont(StandardFonts.Helvetica);
    const innerPage = inner.addPage([200, 200]);
    innerPage.drawText("Form", { x: 10, y: 100, size: 18, font });
    const outer = await PDFDocument.create();
    const page = outer.addPage([200, 200]);
    const embedded = await outer.embedPage((await PDFDocument.load(await inner.save())).getPages()[0]);
    page.drawPage(embedded);
    await outlineAllText(outer);
    expect(findLiveText(outer)).toEqual({ showing: [], fontResources: [] });
  });

  it("exports a text-dense document under the 1000ms budget without live text", async () => {
    const source = await PDFDocument.create();
    const font = await source.embedFont(StandardFonts.Helvetica);
    const line = "The quick brown fox jumps over the lazy dog. ";
    for (let n = 0; n < 20; n += 1) {
      const page = source.addPage([612, 792]);
      for (let y = 720; y > 40; y -= 14) {
        page.drawText(line, { x: 36, y, size: 11, font });
      }
    }
    const id = asSourceId("dense");
    const bytes = await source.save();
    const start = performance.now();
    const out = await writePdfFromPlan(
      Array.from({ length: 20 }, (_, pageIndex) => ({ sourceId: id, pageIndex, rotation: 0 as const, stamps: [] })),
      new Map([[id, bytes]]),
      new Map(),
    );
    const elapsed = performance.now() - start;
    const saved = await PDFDocument.load(out);
    expect(findLiveText(saved)).toEqual({ showing: [], fontResources: [] });
    expect(elapsed).toBeLessThan(1000);
  });

  it("leaves an already outlined document without live text", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([200, 200]);
    page.drawText("Hi", { x: 20, y: 100, size: 12, font });
    await outlineAllText(doc);
    const once = await doc.save();
    const again = await PDFDocument.load(once);
    await outlineAllText(again);
    expect(findLiveText(again)).toEqual({ showing: [], fontResources: [] });
  });
});
