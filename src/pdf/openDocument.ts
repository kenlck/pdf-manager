import { PDFDocument } from "pdf-lib";
import { openPdf, type OpenPdfResult } from "./openPdf";

export const DOCUMENT_EXTENSIONS = ["pdf", "png", "jpg", "jpeg"];
export const DOCUMENT_ACCEPT = "application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg";

export function isSupportedDocument(file: { name: string; type: string }): boolean {
  return /\.(pdf|png|jpe?g)$/i.test(file.name) ||
    ["application/pdf", "image/png", "image/jpeg"].includes(file.type);
}

/** Convert images at the import boundary so all page operations use PDF bytes. */
export async function openDocument(bytes: Uint8Array, path: string): Promise<OpenPdfResult> {
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  if (!png && !jpeg && !/\.(png|jpe?g)$/i.test(path)) return openPdf(bytes, path);

  try {
    const doc = await PDFDocument.create();
    const image = png ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    // One pixel maps to one PDF point; preserve the full image and aspect ratio.
    const page = doc.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    return openPdf(await doc.save(), path);
  } catch {
    return { ok: false, error: { kind: "unreadable", path, message: "This image could not be read. Use a PNG or JPEG image." } };
  }
}
