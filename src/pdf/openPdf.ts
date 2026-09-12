import { PDFDocument } from "pdf-lib";
import type { OpenPdfError, Source } from "../domain/types";
import { asSourceId } from "../domain/types";

export type OpenPdfResult =
  | { ok: true; source: Source; bytes: Uint8Array }
  | { ok: false; error: OpenPdfError };

let sourceCounter = 0;

export function resetSourceCounter(): void {
  sourceCounter = 0;
}

function nextSourceId(): ReturnType<typeof asSourceId> {
  sourceCounter += 1;
  return asSourceId(`src-${sourceCounter}`);
}

function looksLikePdf(bytes: Uint8Array): boolean {
  if (bytes.length < 5) {
    return false;
  }
  const header = String.fromCharCode(
    bytes[0],
    bytes[1],
    bytes[2],
    bytes[3],
    bytes[4],
  );
  return header.startsWith("%PDF");
}

export async function openPdf(
  bytes: Uint8Array,
  path: string,
): Promise<OpenPdfResult> {
  if (!looksLikePdf(bytes)) {
    return {
      ok: false,
      error: {
        kind: "notPdf",
        path,
        message: "This file is not a PDF.",
      },
    };
  }

  try {
    const doc = await PDFDocument.load(bytes, {
      ignoreEncryption: false,
      updateMetadata: false,
    });
    if (doc.isEncrypted) {
      return {
        ok: false,
        error: {
          kind: "encrypted",
          path,
          message: "This PDF is encrypted and cannot be opened.",
        },
      };
    }
    return {
      ok: true,
      source: {
        id: nextSourceId(),
        path,
        pageCount: doc.getPageCount(),
      },
      bytes: new Uint8Array(bytes),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/encrypt/i.test(message) || /password/i.test(message)) {
      return {
        ok: false,
        error: {
          kind: "encrypted",
          path,
          message: "This PDF is encrypted and cannot be opened.",
        },
      };
    }
    return {
      ok: false,
      error: {
        kind: "unreadable",
        path,
        message: "This PDF could not be read.",
      },
    };
  }
}
