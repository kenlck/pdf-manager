import fontkit from "@pdf-lib/fontkit";
import { typefaceOf, type Typeface } from "./glyphs";

export type FaceRequest = {
  readonly family: "sans" | "serif" | "mono";
  readonly bold: boolean;
  readonly italic: boolean;
};

export type TypefaceLibrary = (request: FaceRequest) => Promise<Typeface>;

const files: Record<string, URL> = {
  "sans-0-0": new URL("../fonts/Arimo-Regular.ttf", import.meta.url),
  "sans-1-0": new URL("../fonts/Arimo-Bold.ttf", import.meta.url),
  "sans-0-1": new URL("../fonts/Arimo-Italic.ttf", import.meta.url),
  "sans-1-1": new URL("../fonts/Arimo-BoldItalic.ttf", import.meta.url),
  "serif-0-0": new URL("../fonts/Tinos-Regular.ttf", import.meta.url),
  "serif-1-0": new URL("../fonts/Tinos-Bold.ttf", import.meta.url),
  "serif-0-1": new URL("../fonts/Tinos-Italic.ttf", import.meta.url),
  "serif-1-1": new URL("../fonts/Tinos-BoldItalic.ttf", import.meta.url),
  "mono-0-0": new URL("../fonts/Cousine-Regular.ttf", import.meta.url),
  "mono-1-0": new URL("../fonts/Cousine-Bold.ttf", import.meta.url),
  "mono-0-1": new URL("../fonts/Cousine-Italic.ttf", import.meta.url),
  "mono-1-1": new URL("../fonts/Cousine-BoldItalic.ttf", import.meta.url),
};

const cache = new Map<string, Promise<Typeface>>();

async function readFontFile(url: URL): Promise<Uint8Array> {
  if (url.protocol === "file:") {
    const { readFile } = await import("node:fs/promises");
    return new Uint8Array(await readFile(url));
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load outline font ${url.pathname}.`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function keyOf(request: FaceRequest): string {
  return `${request.family}-${request.bold ? 1 : 0}-${request.italic ? 1 : 0}`;
}

export const bundledTypefaces: TypefaceLibrary = (request) => {
  const key = keyOf(request);
  const url = files[key] ?? files["sans-0-0"];
  let pending = cache.get(key);
  if (!pending) {
    pending = readFontFile(url).then((bytes) => typefaceOf(fontkit.create(bytes)));
    cache.set(key, pending);
  }
  return pending;
};
