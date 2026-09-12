import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";

const PDF_FILTER = [{ name: "PDF", extensions: ["pdf"] }];

export type PickedPdf = {
  path: string;
  bytes: Uint8Array;
};

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function pickViaInput(multiple: boolean): Promise<File[] | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf,.pdf";
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

async function filesToPicked(files: File[]): Promise<PickedPdf[]> {
  return Promise.all(
    files.map(async (file) => ({
      path: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    })),
  );
}

export async function pickOpenPdfs(
  multiple: boolean,
): Promise<PickedPdf[] | null> {
  if (!isTauriRuntime()) {
    const files = await pickViaInput(multiple);
    if (!files) {
      return null;
    }
    return filesToPicked(files);
  }

  const result = await open({
    multiple,
    filters: PDF_FILTER,
    title: multiple ? "Choose PDF files" : "Open PDF",
  });
  if (result === null) {
    return null;
  }
  const paths = Array.isArray(result) ? result : [result];
  const picked: PickedPdf[] = [];
  for (const path of paths) {
    picked.push({ path, bytes: await readFile(path) });
  }
  return picked;
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
): Promise<PickedPdf[]> {
  const picked: PickedPdf[] = [];
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
