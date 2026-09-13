import { DOCUMENT_ACCEPT, DOCUMENT_EXTENSIONS } from "../pdf/openDocument";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";

const PDF_FILTER = [{ name: "PDF", extensions: ["pdf"] }];

export type PickedDocument = {
  path: string;
  bytes: Uint8Array;
};

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function pickViaInput(multiple: boolean, accept: string): Promise<File[] | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = "none";
    document.body.appendChild(input);
    let settled = false;
    const finish = (files: File[] | null) => {
      if (settled) {
        return;
      }
      settled = true;
      input.remove();
      resolve(files);
    };
    input.addEventListener("change", () => {
      const files = input.files ? Array.from(input.files) : [];
      finish(files.length > 0 ? files : null);
    });
    window.addEventListener(
      "focus",
      () => {
        window.setTimeout(() => {
          if (!settled && (!input.files || input.files.length === 0)) {
            finish(null);
          }
        }, 300);
      },
      { once: true },
    );
    input.click();
  });
}

async function filesToPicked(files: File[]): Promise<PickedDocument[]> {
  return Promise.all(
    files.map(async (file) => ({
      path: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    })),
  );
}

export async function pickOpenDocuments(
  multiple: boolean,
): Promise<PickedDocument[] | null> {
  if (!isTauriRuntime()) {
    const files = await pickViaInput(multiple, DOCUMENT_ACCEPT);
    if (!files) {
      return null;
    }
    return filesToPicked(files);
  }

  const result = await open({
    multiple,
    filters: [{ name: "PDFs and images", extensions: DOCUMENT_EXTENSIONS }],
    title: multiple ? "Choose PDFs or images" : "Open PDF or image",
  });
  if (result === null) {
    return null;
  }
  const paths = Array.isArray(result) ? result : [result];
  const picked: PickedDocument[] = [];
  for (const path of paths) {
    picked.push({ path, bytes: await readFile(path) });
  }
  return picked;
}

export type PickedImage = { path: string; bytes: Uint8Array; mime: string };

const IMAGE_FILTER = [{ name: "Images", extensions: ["png", "jpg", "jpeg"] }];

function mimeFromPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) {
    return "image/png";
  }
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  return "application/octet-stream";
}

export async function pickImage(title = "Choose a signature image"): Promise<PickedImage | null> {
  if (!isTauriRuntime()) {
    const files = await pickViaInput(false, "image/png,image/jpeg");
    if (!files || files.length === 0) {
      return null;
    }
    const file = files[0];
    return {
      path: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
      mime: file.type || mimeFromPath(file.name),
    };
  }

  const result = await open({
    multiple: false,
    filters: IMAGE_FILTER,
    title,
  });
  if (result === null || Array.isArray(result)) {
    return null;
  }
  return { path: result, bytes: await readFile(result), mime: mimeFromPath(result) };
}

export async function pickSavePdf(defaultPath?: string): Promise<string | null> {
  if (!isTauriRuntime()) {
    return defaultPath ?? "composed.pdf";
  }
  return save({
    filters: PDF_FILTER,
    defaultPath,
    title: "Save as PDF",
  });
}

export async function writePdfBytes(
  path: string,
  bytes: Uint8Array,
): Promise<void> {
  if (!isTauriRuntime()) {
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = path.split(/[/\\]/).pop() ?? "composed.pdf";
    anchor.click();
    URL.revokeObjectURL(url);
    return;
  }
  await writeFile(path, bytes);
}

export async function loadPdfsFromUrls(
  urls: string[],
): Promise<PickedDocument[]> {
  const picked: PickedDocument[] = [];
  for (const url of urls) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}`);
    }
    const buffer = await response.arrayBuffer();
    picked.push({
      path: url.split("/").pop() ?? url,
      bytes: new Uint8Array(buffer),
    });
  }
  return picked;
}

/** Thin contract for Open dialog results used by tests. */
export function normalizeOpenResult(
  result: string | string[] | null,
): string[] | null {
  if (result === null) {
    return null;
  }
  return Array.isArray(result) ? result : [result];
}
