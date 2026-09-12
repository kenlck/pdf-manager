import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildExportPlan } from "../domain/exportPlan";
import { apply, createSession, pagesFromSource } from "../domain/session";
import { openPdf, resetSourceCounter } from "./openPdf";
import { writePdfFromPlan } from "./write";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("fixture compose path", () => {
  it("opens, reorders, inserts, deletes, and saves four pages", async () => {
    resetSourceCounter();
    const aBytes = await readFile(path.join(root, "fixtures/three-page.pdf"));
    const bBytes = await readFile(path.join(root, "fixtures/two-page.pdf"));
    const a = await openPdf(aBytes, "fixtures/three-page.pdf");
    const b = await openPdf(bBytes, "fixtures/two-page.pdf");
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) {
      return;
    }

    let session = apply(createSession(), {
      type: "open",
      sources: [a.source],
      pages: pagesFromSource(a.source),
    });
    session = apply(session, { type: "move", from: 2, to: 0 });
    session = apply(session, {
      type: "insert",
      sources: [b.source],
      pages: pagesFromSource(b.source),
      afterIndex: 0,
    });
    session = apply(session, { type: "delete", indices: [2] });

    const plan = buildExportPlan(session);
    expect(plan.ok).toBe(true);
    if (!plan.ok) {
      return;
    }
    const outBytes = await writePdfFromPlan(
      plan.pages,
      new Map([
        [a.source.id, a.bytes],
        [b.source.id, b.bytes],
      ]),
      new Map(),
    );
    const loaded = await PDFDocument.load(outBytes);
    expect(loaded.getPageCount()).toBe(4);
  });
});
