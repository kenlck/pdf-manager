import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(root, "../fixtures");

async function makePdf(pageLabels) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (const label of pageLabels) {
    const page = doc.addPage([612, 792]);
    page.drawText(label, {
      x: 72,
      y: 720,
      size: 48,
      font,
      color: rgb(0.1, 0.15, 0.25),
    });
  }
  return doc.save();
}

async function main() {
  await mkdir(fixturesDir, { recursive: true });
  await writeFile(
    path.join(fixturesDir, "three-page.pdf"),
    await makePdf(["Page A1", "Page A2", "Page A3"]),
  );
  await writeFile(
    path.join(fixturesDir, "two-page.pdf"),
    await makePdf(["Page B1", "Page B2"]),
  );
  await writeFile(
    path.join(fixturesDir, "twenty-page.pdf"),
    await makePdf(
      Array.from({ length: 20 }, (_, i) => `Page ${String(i + 1).padStart(2, "0")}`),
    ),
  );
  console.log("Wrote fixtures to", fixturesDir);
}

void main();
