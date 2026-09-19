import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFStream,
  decodePDFRawStream,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { Encodings, Font, FontNames } from "@pdf-lib/standard-fonts";
import { typefaceOf, type Glyph, type Rect, type Typeface } from "./glyphs";
import type { FaceRequest } from "./typefaces";

export type FaceKey = string & { readonly __brand: "FaceKey" };

export type GlyphForm =
  | {
      readonly kind: "outline";
      readonly ops: Uint8Array;
      readonly bbox: Rect;
      readonly path: Glyph["path"];
      readonly unitsPerEm: number;
    }
  | { readonly kind: "procedure"; readonly stream: PDFStream; readonly bbox: Rect };

export type OutlineFont = {
  readonly key: FaceKey;
  decode(string: Uint8Array): readonly number[];
  width(code: number): number;
  isWordSpace(code: number): boolean;
  art(code: number): GlyphForm | null;
};

const WINANSI = new Map<number, { unicode: number; name: string }>();
for (const unicode of Encodings.WinAnsi.supportedCodePoints) {
  const encoded = Encodings.WinAnsi.encodeUnicodeCodePoint(unicode);
  WINANSI.set(encoded.code, { unicode, name: encoded.name });
}

function asName(value: unknown): string {
  if (value instanceof PDFName) return value.decodeText();
  return String(value ?? "").replace(/^\//, "");
}

function asNumber(value: unknown): number | undefined {
  if (value instanceof PDFNumber) return value.asNumber();
  return undefined;
}

function streamBytes(stream: PDFStream): Uint8Array {
  if (stream instanceof PDFRawStream) return decodePDFRawStream(stream).decode();
  if ("getUnencodedContents" in stream && typeof stream.getUnencodedContents === "function") {
    return (stream as PDFStream & { getUnencodedContents: () => Uint8Array }).getUnencodedContents();
  }
  return stream.getContents();
}

function lookupStream(dict: PDFDict, key: string): PDFStream | undefined {
  const value = dict.lookup(PDFName.of(key));
  return value instanceof PDFStream ? value : undefined;
}

const faceKeys = new WeakMap<PDFDict, FaceKey>();
let faceKeySeq = 0;

function faceKeyFor(dict: PDFDict): FaceKey {
  const existing = faceKeys.get(dict);
  if (existing) return existing;
  const key = `f${faceKeySeq++}` as FaceKey;
  faceKeys.set(dict, key);
  return key;
}

const STANDARD: Record<string, FaceRequest> = {
  Helvetica: { family: "sans", bold: false, italic: false },
  "Helvetica-Bold": { family: "sans", bold: true, italic: false },
  "Helvetica-Oblique": { family: "sans", bold: false, italic: true },
  "Helvetica-BoldOblique": { family: "sans", bold: true, italic: true },
  "Times-Roman": { family: "serif", bold: false, italic: false },
  "Times-Bold": { family: "serif", bold: true, italic: false },
  "Times-Italic": { family: "serif", bold: false, italic: true },
  "Times-BoldItalic": { family: "serif", bold: true, italic: true },
  Courier: { family: "mono", bold: false, italic: false },
  "Courier-Bold": { family: "mono", bold: true, italic: false },
  "Courier-Oblique": { family: "mono", bold: false, italic: true },
  "Courier-BoldOblique": { family: "mono", bold: true, italic: true },
  Arial: { family: "sans", bold: false, italic: false },
  "Arial-Bold": { family: "sans", bold: true, italic: false },
  "Arial-Italic": { family: "sans", bold: false, italic: true },
  "Arial-BoldItalic": { family: "sans", bold: true, italic: true },
};

const ALIASES: Record<string, string> = {
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
};

export function canonicalBaseFont(name: string): string {
  const bare = name.replace(/^[/]/, "").replace(/^[A-Z]{6}\+/, "");
  return ALIASES[bare] ?? bare;
}

export function faceRequestFor(dict: PDFDict): FaceRequest {
  const base = canonicalBaseFont(asName(dict.lookup(PDFName.of("BaseFont"))));
  if (STANDARD[base]) return STANDARD[base];
  const descriptor =
    dict.lookupMaybe(PDFName.of("FontDescriptor"), PDFDict) ??
    descendant(dict)?.lookupMaybe(PDFName.of("FontDescriptor"), PDFDict);
  const flags = asNumber(descriptor?.lookup(PDFName.of("Flags"))) ?? 0;
  const angle = asNumber(descriptor?.lookup(PDFName.of("ItalicAngle"))) ?? 0;
  const stem = asNumber(descriptor?.lookup(PDFName.of("StemV"))) ?? 0;
  const italic = Boolean(flags & 64) || angle !== 0 || /italic|oblique/i.test(base);
  const bold = Boolean(flags & (1 << 18)) || stem >= 120 || /bold/i.test(base);
  const family: FaceRequest["family"] = flags & 1 ? "mono" : flags & 2 ? "serif" : "sans";
  return { family, bold, italic };
}

function descendant(dict: PDFDict): PDFDict | undefined {
  const array = dict.lookupMaybe(PDFName.of("DescendantFonts"), PDFArray);
  if (!array || array.size() === 0) return undefined;
  const first = dict.context.lookup(array.get(0));
  return first instanceof PDFDict ? first : undefined;
}

function embeddedFace(dict: PDFDict): Typeface | null {
  const descriptor = dict.lookupMaybe(PDFName.of("FontDescriptor"), PDFDict);
  if (!descriptor) return null;
  for (const key of ["FontFile2", "FontFile3", "FontFile"] as const) {
    const stream = lookupStream(descriptor, key);
    if (!stream) continue;
    try {
      return typefaceOf(fontkit.create(streamBytes(stream)));
    } catch {
      return null;
    }
  }
  return null;
}

function readSimpleWidths(dict: PDFDict): Map<number, number> {
  const map = new Map<number, number>();
  const first = asNumber(dict.lookup(PDFName.of("FirstChar")));
  const widths = dict.lookup(PDFName.of("Widths"));
  if (first === undefined || !(widths instanceof PDFArray)) return map;
  widths.asArray().forEach((item, index) => {
    map.set(first + index, asNumber(dict.context.lookup(item)) ?? 0);
  });
  return map;
}

function readCidWidths(cid: PDFDict): { defaultWidth: number; widths: Map<number, number> } {
  const widths = new Map<number, number>();
  const defaultWidth = asNumber(cid.lookup(PDFName.of("DW"))) ?? 1000;
  const w = cid.lookup(PDFName.of("W"));
  if (!(w instanceof PDFArray)) return { defaultWidth, widths };
  const items = w.asArray().map((item) => cid.context.lookup(item));
  for (let i = 0; i < items.length; ) {
    const first = asNumber(items[i]);
    const next = items[i + 1];
    if (first === undefined) break;
    if (next instanceof PDFArray) {
      next.asArray().forEach((item, offset) => {
        widths.set(first + offset, asNumber(cid.context.lookup(item)) ?? defaultWidth);
      });
      i += 2;
    } else {
      const last = asNumber(next);
      const width = asNumber(items[i + 2]);
      if (last === undefined || width === undefined) break;
      for (let code = first; code <= last; code += 1) widths.set(code, width);
      i += 3;
    }
  }
  return { defaultWidth, widths };
}

function standardAfm(base: string): Font | null {
  const clean = canonicalBaseFont(base);
  return Object.values(FontNames).includes(clean as FontNames) ? Font.load(clean as FontNames) : null;
}

function cidToGid(cidFont: PDFDict): (cid: number) => number {
  const mapping = cidFont.lookup(PDFName.of("CIDToGIDMap"));
  if (!mapping || (mapping instanceof PDFName && mapping.decodeText() === "Identity")) {
    return (cid) => cid;
  }
  if (mapping instanceof PDFStream) {
    const bytes = streamBytes(mapping);
    return (cid) => {
      const index = cid * 2;
      if (index + 1 >= bytes.length) return cid;
      return (bytes[index] << 8) | bytes[index + 1];
    };
  }
  return (cid) => cid;
}

function fontBBox(dict: PDFDict): Rect {
  const box = dict.lookup(PDFName.of("FontBBox"));
  if (box instanceof PDFArray && box.size() >= 4) {
    return [
      asNumber(dict.context.lookup(box.get(0))) ?? 0,
      asNumber(dict.context.lookup(box.get(1))) ?? 0,
      asNumber(dict.context.lookup(box.get(2))) ?? 1000,
      asNumber(dict.context.lookup(box.get(3))) ?? 1000,
    ];
  }
  return [0, 0, 1000, 1000];
}

function outlineOf(glyph: Glyph | null, unitsPerEm: number): GlyphForm | null {
  if (!glyph) return null;
  return {
    kind: "outline",
    ops: glyph.ops,
    bbox: glyph.bbox,
    path: glyph.path,
    unitsPerEm,
  };
}

function simpleFont(dict: PDFDict, fallback: Typeface): OutlineFont {
  const face = embeddedFace(dict) ?? fallback;
  const base = asName(dict.lookup(PDFName.of("BaseFont")));
  const metrics = standardAfm(base);
  const widths = readSimpleWidths(dict);
  const cache = new Map<number, GlyphForm | null>();
  return {
    key: faceKeyFor(dict),
    decode: (bytes) => Array.from(bytes),
    isWordSpace: (code) => code === 32,
    width(code) {
      const explicit = widths.get(code);
      if (explicit !== undefined) return explicit / 1000;
      const name = WINANSI.get(code)?.name;
      const afm = name && metrics ? metrics.getWidthOfGlyph(name) : undefined;
      if (afm !== undefined && afm !== null) return afm / 1000;
      return 0.5;
    },
    art(code) {
      if (cache.has(code)) return cache.get(code) ?? null;
      const unicode = WINANSI.get(code)?.unicode ?? code;
      const form = outlineOf(face.byUnicode(unicode), face.unitsPerEm);
      cache.set(code, form);
      return form;
    },
  };
}

function compositeFont(dict: PDFDict, fallback: Typeface): OutlineFont {
  const cidFont = descendant(dict) ?? dict;
  const face = embeddedFace(cidFont) ?? fallback;
  const { defaultWidth, widths } = readCidWidths(cidFont);
  const gidOf = cidToGid(cidFont);
  const cache = new Map<number, GlyphForm | null>();
  return {
    key: faceKeyFor(dict),
    decode(bytes) {
      const codes: number[] = [];
      for (let i = 0; i + 1 < bytes.length; i += 2) codes.push((bytes[i] << 8) | bytes[i + 1]);
      return codes;
    },
    isWordSpace: () => false,
    width: (code) => (widths.get(code) ?? defaultWidth) / 1000,
    art(code) {
      if (cache.has(code)) return cache.get(code) ?? null;
      const form =
        outlineOf(face.byGlyphId(gidOf(code)), face.unitsPerEm) ??
        outlineOf(face.byUnicode(code), face.unitsPerEm);
      cache.set(code, form);
      return form;
    },
  };
}

function type3Font(dict: PDFDict): OutlineFont {
  const procs = dict.lookupMaybe(PDFName.of("CharProcs"), PDFDict);
  const encoding = new Map<number, string>();
  const differences = dict.lookup(PDFName.of("Encoding"));
  const diffArray =
    differences instanceof PDFDict ? differences.lookup(PDFName.of("Differences"), PDFArray) : undefined;
  if (diffArray) {
    let next = 0;
    for (const item of diffArray.asArray()) {
      const value = dict.context.lookup(item);
      if (value instanceof PDFNumber) next = value.asNumber();
      else if (value instanceof PDFName) {
        encoding.set(next, value.decodeText());
        next += 1;
      }
    }
  }
  const widths = readSimpleWidths(dict);
  const bbox = fontBBox(dict);
  const cache = new Map<number, GlyphForm | null>();
  return {
    key: faceKeyFor(dict),
    decode: (bytes) => Array.from(bytes),
    isWordSpace: (code) => code === 32,
    width: (code) => (widths.get(code) ?? 0) / 1000,
    art(code) {
      if (cache.has(code)) return cache.get(code) ?? null;
      const name = encoding.get(code);
      const stream = name && procs ? procs.lookup(PDFName.of(name)) : undefined;
      const form =
        stream instanceof PDFStream ? { kind: "procedure" as const, stream, bbox } : null;
      cache.set(code, form);
      return form;
    },
  };
}

export function outlineFontFor(dict: PDFDict, face: Typeface): OutlineFont {
  const subtype = asName(dict.lookup(PDFName.of("Subtype")));
  if (subtype === "Type0") return compositeFont(dict, face);
  if (subtype === "Type3") return type3Font(dict);
  return simpleFont(dict, face);
}

export function fontObjectRefs(dict: PDFDict): PDFRef[] {
  const refs: PDFRef[] = [];
  const take = (value: unknown) => {
    if (value instanceof PDFRef) refs.push(value);
  };
  take(dict.get(PDFName.of("FontDescriptor")));
  take(dict.get(PDFName.of("ToUnicode")));
  const descriptor = dict.lookupMaybe(PDFName.of("FontDescriptor"), PDFDict);
  if (descriptor) {
    take(dict.get(PDFName.of("FontDescriptor")));
    for (const key of ["FontFile", "FontFile2", "FontFile3"] as const) take(descriptor.get(PDFName.of(key)));
  }
  const descendants = dict.get(PDFName.of("DescendantFonts"));
  take(descendants);
  const cid = descendant(dict);
  if (cid) refs.push(...fontObjectRefs(cid));
  take(cid?.get(PDFName.of("CIDToGIDMap")));
  return refs;
}
