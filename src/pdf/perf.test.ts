import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildExportPlan } from "../domain/exportPlan";
import { apply, createSession, pagesFromSource } from "../domain/session";
import { openPdf, resetSourceCounter } from "./openPdf";
import { writePdfFromPlan } from "./write";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("perf budgets", () => {
  it("exports a 20-page fixture under 1000ms", async () => {
    resetSourceCounter();
    const bytes = await readFile(path.join(root, "fixtures/twenty-page.pdf"));
    const opened = await openPdf(bytes, "fixtures/twenty-page.pdf");
    expect(opened.ok).toBe(true);
    if (!opened.ok) {
      return;
    }
    const session = apply(createSession(), {
      type: "open",
      sources: [opened.source],
      pages: pagesFromSource(opened.source),
    });
    const plan = buildExportPlan(session);
    expect(plan.ok).toBe(true);
    if (!plan.ok) {
      return;
    }
    const start = performance.now();
    const out = await writePdfFromPlan(
      plan.pages,
      new Map([[opened.source.id, opened.bytes]]),
      new Map(),
      "live",
    );
    const elapsed = performance.now() - start;
    expect(out.byteLength).toBeGreaterThan(1000);
    expect(elapsed).toBeLessThan(1000);
  });
});
