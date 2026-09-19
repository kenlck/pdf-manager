import fontkit from "@pdf-lib/fontkit";
import type { Font } from "@pdf-lib/fontkit";

const files: Record<string, URL> = {
  Helvetica: new URL("./fonts/Arimo-Regular.ttf", import.meta.url),
  "Helvetica-Bold": new URL("./fonts/Arimo-Bold.ttf", import.meta.url),
  "Helvetica-Oblique": new URL("./fonts/Arimo-Italic.ttf", import.meta.url),
  "Helvetica-BoldOblique": new URL("./fonts/Arimo-BoldItalic.ttf", import.meta.url),
  "Times-Roman": new URL("./fonts/Tinos-Regular.ttf", import.meta.url),
  "Times-Bold": new URL("./fonts/Tinos-Bold.ttf", import.meta.url),
  "Times-Italic": new URL("./fonts/Tinos-Italic.ttf", import.meta.url),
  "Times-BoldItalic": new URL("./fonts/Tinos-BoldItalic.ttf", import.meta.url),
  Courier: new URL("./fonts/Cousine-Regular.ttf", import.meta.url),
  "Courier-Bold": new URL("./fonts/Cousine-Bold.ttf", import.meta.url),
  "Courier-Oblique": new URL("./fonts/Cousine-Italic.ttf", import.meta.url),
  "Courier-BoldOblique": new URL("./fonts/Cousine-BoldItalic.ttf", import.meta.url),
};

const aliases: Record<string, string> = {
  HelveticaOblique: "Helvetica-Oblique",
  HelveticaBold: "Helvetica-Bold",
  HelveticaBoldOblique: "Helvetica-BoldOblique",
  TimesNewRoman: "Times-Roman",
  TimesNewRomanBold: "Times-Bold",
  TimesNewRomanItalic: "Times-Italic",
  TimesNewRomanBoldItalic: "Times-BoldItalic",
  CourierOblique: "Courier-Oblique",
  CourierBold: "Courier-Bold",
  CourierBoldOblique: "Courier-BoldOblique",
  Arial: "Helvetica",
  "Arial-Bold": "Helvetica-Bold",
  "Arial-Italic": "Helvetica-Oblique",
  "Arial-BoldItalic": "Helvetica-BoldOblique",
};

const cache = new Map<string, Promise<Font>>();

export function canonicalBaseFont(name: string): string {
  const bare = name.replace(/^[/]/, "").replace(/^[A-Z]{6}\+/, "");
  return aliases[bare] ?? bare;
}

export function isStandard14(name: string): boolean {
  return canonicalBaseFont(name) in files;
}

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

export function loadStandardFace(baseFont: string): Promise<Font> {
  const name = canonicalBaseFont(baseFont);
  const url = files[name];
  if (!url) {
    throw new Error(`No outline substitute for font ${baseFont}.`);
  }
  let pending = cache.get(name);
  if (!pending) {
    pending = readFontFile(url).then((bytes) => fontkit.create(bytes));
    cache.set(name, pending);
  }
  return pending;
}

export function faceFromEmbedded(bytes: Uint8Array): Font {
  return fontkit.create(bytes);
}
