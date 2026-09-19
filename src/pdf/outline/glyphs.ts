import {
  appendBezierCurve,
  appendQuadraticCurve,
  closePath,
  lineTo,
  moveTo,
} from "pdf-lib";
import type { Font as FontkitFont, Glyph as FontkitGlyph } from "@pdf-lib/fontkit";

export type Rect = readonly [number, number, number, number];

export type PathCommand = {
  readonly command: string;
  readonly args: readonly number[];
};

export type Glyph = {
  readonly ops: Uint8Array;
  readonly bbox: Rect;
  readonly path: readonly PathCommand[];
};

export type Typeface = {
  readonly unitsPerEm: number;
  byGlyphId(gid: number): Glyph | null;
  byUnicode(codePoint: number): Glyph | null;
};

const latin1 = new TextEncoder();

function pathCommands(glyph: FontkitGlyph): PathCommand[] {
  return ((glyph.path as unknown as { commands?: PathCommand[] }).commands ?? []).filter(
    (item) => item.command !== "closePath" || item.args.length === 0,
  );
}

function serialize(path: readonly PathCommand[]): { ops: Uint8Array; bbox: Rect } | null {
  const parts: string[] = [];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const see = (x: number, y: number) => {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  };
  for (const { command, args } of path) {
    if (command === "moveTo") {
      parts.push(moveTo(args[0], args[1]).toString());
      see(args[0], args[1]);
    } else if (command === "lineTo") {
      parts.push(lineTo(args[0], args[1]).toString());
      see(args[0], args[1]);
    } else if (command === "quadraticCurveTo") {
      parts.push(appendQuadraticCurve(args[0], args[1], args[2], args[3]).toString());
      see(args[0], args[1]);
      see(args[2], args[3]);
    } else if (command === "bezierCurveTo") {
      parts.push(appendBezierCurve(args[0], args[1], args[2], args[3], args[4], args[5]).toString());
      see(args[0], args[1]);
      see(args[2], args[3]);
      see(args[4], args[5]);
    } else if (command === "closePath") {
      parts.push(closePath().toString());
    }
  }
  if (parts.length === 0) return null;
  return { ops: latin1.encode(parts.join("\n") + "\n"), bbox: [x0, y0, x1, y1] };
}

function fromFontkit(glyph: FontkitGlyph): Glyph | null {
  const path = pathCommands(glyph);
  const serialized = serialize(path);
  if (!serialized) return null;
  const box = glyph.bbox;
  const bbox: Rect =
    box && Number.isFinite(box.minX)
      ? [box.minX, box.minY, box.maxX, box.maxY]
      : serialized.bbox;
  return { ops: serialized.ops, bbox, path };
}

export function typefaceOf(font: FontkitFont): Typeface {
  const cache = new Map<number, Glyph | null>();
  const byGlyphId = (gid: number): Glyph | null => {
    if (cache.has(gid)) return cache.get(gid) ?? null;
    let glyph: Glyph | null = null;
    try {
      glyph = fromFontkit(font.getGlyph(gid));
    } catch {
      glyph = null;
    }
    cache.set(gid, glyph);
    return glyph;
  };
  return {
    unitsPerEm: font.unitsPerEm || 1000,
    byGlyphId,
    byUnicode(codePoint: number) {
      try {
        if (!font.hasGlyphForCodePoint(codePoint)) return null;
        return byGlyphId(font.glyphForCodePoint(codePoint).id);
      } catch {
        return null;
      }
    },
  };
}
