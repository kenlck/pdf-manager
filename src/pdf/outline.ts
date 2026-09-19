import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFPage,
  PDFRawStream,
  PDFRef,
  PDFStream,
  appendBezierCurve,
  appendQuadraticCurve,
  closePath,
  concatTransformationMatrix,
  decodePDFRawStream,
  fill,
  fillAndStroke,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  stroke,
} from "pdf-lib";
import type { Font, Glyph } from "@pdf-lib/fontkit";
import { canonicalBaseFont, faceFromEmbedded, isStandard14, loadStandardFace } from "./outlineFonts";

const TEXT_OPS = new Set([
  "BT", "ET", "Tc", "Tw", "Tz", "TL", "Tf", "Tr", "Ts", "Td", "TD", "Tm", "T*", "Tj", "TJ", "'", '"',
]);

type Matrix = readonly [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

type Value =
  | { readonly t: "n"; readonly v: number }
  | { readonly t: "name"; readonly v: string }
  | { readonly t: "str"; readonly v: Uint8Array }
  | { readonly t: "arr"; readonly v: Value[] };

type Op = { readonly name: string; readonly args: Value[] };

type Face = {
  font: Font;
  glyph: (code: number) => Glyph;
};

type TextState = {
  face: Face | null;
  size: number;
  charSpacing: number;
  wordSpacing: number;
  horizScale: number;
  leading: number;
  rise: number;
  renderMode: number;
  line: Matrix;
  text: Matrix;
};

type PathCommand = { command: string; args: number[] };

export class OutlineFailed extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutlineFailed";
  }
}

function mul(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function translate(x: number, y: number): Matrix {
  return [1, 0, 0, 1, x, y];
}

function scale(sx: number, sy: number): Matrix {
  return [sx, 0, 0, sy, 0, 0];
}

function defaultText(): TextState {
  return {
    face: null,
    size: 0,
    charSpacing: 0,
    wordSpacing: 0,
    horizScale: 100,
    leading: 0,
    rise: 0,
    renderMode: 0,
    line: IDENTITY,
    text: IDENTITY,
  };
}

function cloneText(state: TextState): TextState {
  return { ...state };
}

function winAnsiChar(code: number): string {
  if (code >= 0x20 && code <= 0x7e) return String.fromCharCode(code);
  const extra: Record<number, number> = {
    0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026,
    0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160,
    0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019,
    0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
    0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153,
    0x9e: 0x017e, 0x9f: 0x0178,
  };
  const mapped = extra[code];
  if (mapped) return String.fromCodePoint(mapped);
  if (code >= 0xa0) return String.fromCharCode(code);
  return "";
}

function tokenize(content: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  const n = content.length;
  while (i < n) {
    const ch = content[i];
    if (ch === " " || ch === "\n" || ch === "\r" || ch === "\t" || ch === "\f" || ch === "\0") {
      i += 1;
      continue;
    }
    if (ch === "%") {
      while (i < n && content[i] !== "\n" && content[i] !== "\r") i += 1;
      continue;
    }
    if (ch === "/") {
      let j = i + 1;
      while (j < n && !/[\s()<>[\]/%]/.test(content[j])) j += 1;
      tokens.push(content.slice(i, j));
      i = j;
      continue;
    }
    if (ch === "(") {
      let j = i + 1;
      let depth = 1;
      while (j < n && depth > 0) {
        if (content[j] === "\\") {
          j += 2;
          continue;
        }
        if (content[j] === "(") depth += 1;
        else if (content[j] === ")") depth -= 1;
        j += 1;
      }
      tokens.push(content.slice(i, j));
      i = j;
      continue;
    }
    if (ch === "<") {
      if (content[i + 1] === "<") {
        tokens.push("<<");
        i += 2;
        continue;
      }
      const end = content.indexOf(">", i + 1);
      if (end < 0) throw new OutlineFailed("Unclosed hex string in PDF content.");
      tokens.push(content.slice(i, end + 1));
      i = end + 1;
      continue;
    }
    if (ch === ">" && content[i + 1] === ">") {
      tokens.push(">>");
      i += 2;
      continue;
    }
    if (ch === "[" || ch === "]") {
      tokens.push(ch);
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"') {
      tokens.push(ch);
      i += 1;
      continue;
    }
    if (/[-+0-9.]/.test(ch)) {
      const match = content.slice(i).match(/^[+-]?(?:\d+\.\d*|\.\d+|\d+)/);
      if (match) {
        tokens.push(match[0]);
        i += match[0].length;
        continue;
      }
    }
    const match = content.slice(i).match(/^[A-Za-z*]+/);
    if (match) {
      tokens.push(match[0]);
      i += match[0].length;
      continue;
    }
    i += 1;
  }
  return tokens;
}

function parseLiteralString(token: string): Uint8Array {
  const inner = token.slice(1, -1);
  const bytes: number[] = [];
  for (let i = 0; i < inner.length; i += 1) {
    if (inner[i] !== "\\") {
      bytes.push(inner.charCodeAt(i) & 0xff);
      continue;
    }
    const next = inner[i + 1];
    if (next === undefined) break;
    const simple: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12, "(": 40, ")": 41, "\\": 92 };
    if (next in simple) {
      bytes.push(simple[next]);
      i += 1;
      continue;
    }
    if (/[0-7]/.test(next)) {
      let oct = next;
      let used = 1;
      if (/[0-7]/.test(inner[i + 2] ?? "")) {
        oct += inner[i + 2];
        used += 1;
      }
      if (/[0-7]/.test(inner[i + 1 + used] ?? "") && used < 3) {
        oct += inner[i + 1 + used];
        used += 1;
      }
      bytes.push(parseInt(oct, 8) & 0xff);
      i += used;
      continue;
    }
    if (next === "\n" || next === "\r") {
      if (next === "\r" && inner[i + 2] === "\n") i += 2;
      else i += 1;
      continue;
    }
    bytes.push(next.charCodeAt(0) & 0xff);
    i += 1;
  }
  return Uint8Array.from(bytes);
}

function parseHexString(token: string): Uint8Array {
  const hex = token.slice(1, -1).replace(/\s/g, "");
  const padded = hex.length % 2 === 1 ? `${hex}0` : hex;
  const bytes = new Uint8Array(padded.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(padded.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function parseValue(tokens: string[], i: number): { value: Value; next: number } {
  const token = tokens[i];
  if (token === "[") {
    const items: Value[] = [];
    let j = i + 1;
    while (j < tokens.length && tokens[j] !== "]") {
      const parsed = parseValue(tokens, j);
      items.push(parsed.value);
      j = parsed.next;
    }
    return { value: { t: "arr", v: items }, next: j + 1 };
  }
  if (token.startsWith("/")) return { value: { t: "name", v: token.slice(1) }, next: i + 1 };
  if (token.startsWith("(")) return { value: { t: "str", v: parseLiteralString(token) }, next: i + 1 };
  if (token.startsWith("<") && token.endsWith(">")) {
    return { value: { t: "str", v: parseHexString(token) }, next: i + 1 };
  }
  if (token === "true" || token === "false" || token === "null") {
    return { value: { t: "name", v: token }, next: i + 1 };
  }
  return { value: { t: "n", v: Number(token) }, next: i + 1 };
}

function parseOps(content: string): Op[] {
  const tokens = tokenize(content);
  const ops: Op[] = [];
  let i = 0;
  const args: Value[] = [];
  while (i < tokens.length) {
    const token = tokens[i];
    const isOp =
      token === "'" ||
      token === '"' ||
      (/^[A-Za-z*]/.test(token) && !token.startsWith("/") && token !== "true" && token !== "false" && token !== "null");
    if (isOp && token !== "[" && token !== "]") {
      ops.push({ name: token, args: args.splice(0) });
      i += 1;
      continue;
    }
    const parsed = parseValue(tokens, i);
    args.push(parsed.value);
    i = parsed.next;
  }
  return ops;
}

function formatValue(value: Value): string {
  if (value.t === "n") return Number.isInteger(value.v) ? String(value.v) : String(value.v);
  if (value.t === "name") return `/${value.v}`;
  if (value.t === "arr") return `[${value.v.map(formatValue).join(" ")}]`;
  const hex = Array.from(value.v, (b) => b.toString(16).padStart(2, "0")).join("");
  return `<${hex}>`;
}

function formatOp(op: Op): string {
  return `${op.args.map(formatValue).join(" ")}${op.args.length ? " " : ""}${op.name}`;
}

function num(args: Value[], index: number): number {
  const value = args[index];
  if (!value || value.t !== "n") throw new OutlineFailed("PDF text operator is missing a number.");
  return value.v;
}

function pathCommands(glyph: Glyph): PathCommand[] {
  return (glyph.path as unknown as { commands: PathCommand[] }).commands ?? [];
}

function pathOperators(commands: PathCommand[]) {
  return commands.flatMap(({ command, args }) => {
    if (command === "moveTo") return [moveTo(args[0], args[1])];
    if (command === "lineTo") return [lineTo(args[0], args[1])];
    if (command === "quadraticCurveTo") return [appendQuadraticCurve(args[0], args[1], args[2], args[3])];
    if (command === "bezierCurveTo") {
      return [appendBezierCurve(args[0], args[1], args[2], args[3], args[4], args[5])];
    }
    if (command === "closePath") return [closePath()];
    return [];
  });
}

function paintOp(mode: number) {
  const fillStroke = mode & 3;
  if (fillStroke === 2) return fillAndStroke();
  if (fillStroke === 1) return stroke();
  return fill();
}

function showCodes(state: TextState, bytes: Uint8Array): string {
  if (!state.face || state.size === 0) throw new OutlineFailed("PDF text is shown before a font is set.");
  if (state.renderMode === 3) {
    advance(state, bytes);
    return "";
  }
  const { font } = state.face;
  const sx = (state.horizScale / 100) * (state.size / font.unitsPerEm);
  const sy = state.size / font.unitsPerEm;
  const chunks: string[] = [];
  let x = 0;
  for (const code of bytes) {
    const glyph = state.face.glyph(code);
    const origin = mul(state.text, mul(translate(x * sx, state.rise), scale(sx, sy)));
    const commands = pathCommands(glyph);
    if (commands.length > 0) {
      const ops = [
        pushGraphicsState(),
        concatTransformationMatrix(...origin),
        ...pathOperators(commands),
        paintOp(state.renderMode),
        popGraphicsState(),
      ];
      chunks.push(ops.map((op) => op.toString()).join("\n"));
    }
    x += glyph.advanceWidth;
    x += (state.charSpacing * font.unitsPerEm) / state.size;
    if (code === 0x20) x += (state.wordSpacing * font.unitsPerEm) / state.size;
  }
  state.text = mul(state.text, translate(x * sx, 0));
  return chunks.join("\n");
}

function advance(state: TextState, bytes: Uint8Array): void {
  if (!state.face || state.size === 0) return;
  const { font } = state.face;
  const sx = (state.horizScale / 100) * (state.size / font.unitsPerEm);
  let x = 0;
  for (const code of bytes) {
    x += state.face.glyph(code).advanceWidth;
    x += (state.charSpacing * font.unitsPerEm) / state.size;
    if (code === 0x20) x += (state.wordSpacing * font.unitsPerEm) / state.size;
  }
  state.text = mul(state.text, translate(x * sx, 0));
}

function showValue(state: TextState, value: Value): string {
  if (value.t === "str") return showCodes(state, value.v);
  if (value.t === "arr") {
    const parts: string[] = [];
    for (const item of value.v) {
      if (item.t === "n") {
        state.text = mul(state.text, translate((-item.v / 1000) * state.size * (state.horizScale / 100), 0));
      } else {
        parts.push(showValue(state, item));
      }
    }
    return parts.filter(Boolean).join("\n");
  }
  throw new OutlineFailed("PDF text show operand is not a string.");
}

function nextLine(state: TextState): void {
  state.line = mul(state.line, translate(0, -state.leading));
  state.text = state.line;
}

function streamBytes(stream: PDFStream): Uint8Array {
  if (stream instanceof PDFRawStream) return decodePDFRawStream(stream).decode();
  return stream.getContents();
}

function decodeStream(stream: PDFStream): string {
  if (stream instanceof PDFRawStream) {
    return new TextDecoder("latin1").decode(decodePDFRawStream(stream).decode());
  }
  return stream.getContentsString();
}

export function decodePageContents(page: PDFPage): string {
  page.node.normalize();
  const contents = page.node.Contents();
  if (!contents) return "";
  const parts: string[] = [];
  const push = (object: unknown) => {
    if (object instanceof PDFStream) {
      parts.push(decodeStream(object));
    }
  };
  if (contents instanceof PDFArray) {
    for (let i = 0; i < contents.size(); i += 1) {
      push(page.node.context.lookup(contents.get(i)));
    }
  } else {
    push(contents);
  }
  return parts.join("\n");
}

async function embeddedFace(fontDict: PDFDict): Promise<Font | null> {
  const descriptor = fontDict.lookupMaybe(PDFName.of("FontDescriptor"), PDFDict);
  if (!descriptor) return null;
  for (const key of ["FontFile2", "FontFile3", "FontFile"] as const) {
    const file = descriptor.lookup(PDFName.of(key));
    const stream = file instanceof PDFRef ? fontDict.context.lookup(file) : file;
    if (stream instanceof PDFStream) return faceFromEmbedded(streamBytes(stream));
  }
  return null;
}

function encodingIsWinAnsi(fontDict: PDFDict): boolean {
  const encoding = fontDict.lookup(PDFName.of("Encoding"));
  if (!encoding) return true;
  const name = encoding instanceof PDFName ? encoding.decodeText() : encoding.toString();
  return name.includes("WinAnsi") || name.includes("MacRoman") || name.includes("StandardEncoding");
}

async function resolveFace(fontDict: PDFDict, cache: Map<PDFDict, Promise<Face>>): Promise<Face> {
  const existing = cache.get(fontDict);
  if (existing) return existing;
  const pending = (async () => {
    const subtype = fontDict.lookup(PDFName.of("Subtype"))?.toString() ?? "";
    if (subtype.includes("Type0") || subtype.includes("CIDFont")) {
      throw new OutlineFailed("This PDF uses a composite font that cannot be outlined yet.");
    }
    const base = fontDict.lookup(PDFName.of("BaseFont"));
    const baseFont = base instanceof PDFName ? base.decodeText() : String(base ?? "");
    const embedded = await embeddedFace(fontDict);
    const font = embedded ?? (isStandard14(baseFont) ? await loadStandardFace(baseFont) : null);
    if (!font) {
      throw new OutlineFailed(`Cannot outline font ${canonicalBaseFont(baseFont) || "unknown"}.`);
    }
    if (!encodingIsWinAnsi(fontDict) && !embedded) {
      throw new OutlineFailed(`Cannot outline font encoding for ${baseFont}.`);
    }
    return {
      font,
      glyph: (code: number) => {
        const ch = winAnsiChar(code);
        return font.glyphForCodePoint(ch ? ch.codePointAt(0)! : code);
      },
    };
  })();
  cache.set(fontDict, pending);
  return pending;
}

function lookupFont(resources: PDFDict | undefined, name: string): PDFDict {
  const fonts = resources?.lookupMaybe(PDFName.of("Font"), PDFDict);
  const dict = fonts?.lookup(PDFName.of(name));
  const resolved = dict instanceof PDFRef ? resources?.context.lookup(dict) : dict;
  if (!(resolved instanceof PDFDict)) throw new OutlineFailed(`Missing font /${name}.`);
  return resolved;
}

async function rewriteContent(content: string, resources: PDFDict | undefined, faces: Map<PDFDict, Promise<Face>>): Promise<string> {
  const ops = parseOps(content);
  const gfx: TextState[] = [];
  let text = defaultText();
  let inText = false;
  const out: string[] = [];
  for (const op of ops) {
    if (op.name === "q") {
      gfx.push(cloneText(text));
      out.push(formatOp(op));
      continue;
    }
    if (op.name === "Q") {
      text = gfx.pop() ?? defaultText();
      out.push(formatOp(op));
      continue;
    }
    if (!TEXT_OPS.has(op.name)) {
      out.push(formatOp(op));
      continue;
    }
    if (op.name === "BT") {
      inText = true;
      text.line = IDENTITY;
      text.text = IDENTITY;
      continue;
    }
    if (op.name === "ET") {
      inText = false;
      continue;
    }
    if (!inText && op.name !== "Tf") continue;
    if (op.name === "Tc") text.charSpacing = num(op.args, 0);
    else if (op.name === "Tw") text.wordSpacing = num(op.args, 0);
    else if (op.name === "Tz") text.horizScale = num(op.args, 0);
    else if (op.name === "TL") text.leading = num(op.args, 0);
    else if (op.name === "Tr") text.renderMode = num(op.args, 0);
    else if (op.name === "Ts") text.rise = num(op.args, 0);
    else if (op.name === "Tf") {
      const fontName = op.args[0];
      if (!fontName || fontName.t !== "name") throw new OutlineFailed("Tf is missing a font name.");
      text.face = await resolveFace(lookupFont(resources, fontName.v), faces);
      text.size = num(op.args, 1);
    } else if (op.name === "Tm") {
      text.text = [num(op.args, 0), num(op.args, 1), num(op.args, 2), num(op.args, 3), num(op.args, 4), num(op.args, 5)];
      text.line = text.text;
    } else if (op.name === "Td") {
      text.line = mul(text.line, translate(num(op.args, 0), num(op.args, 1)));
      text.text = text.line;
    } else if (op.name === "TD") {
      text.leading = -num(op.args, 1);
      text.line = mul(text.line, translate(num(op.args, 0), num(op.args, 1)));
      text.text = text.line;
    } else if (op.name === "T*") {
      nextLine(text);
    } else if (op.name === "Tj") {
      const drawn = showValue(text, op.args[0]);
      if (drawn) out.push(drawn);
    } else if (op.name === "TJ") {
      const drawn = showValue(text, op.args[0]);
      if (drawn) out.push(drawn);
    } else if (op.name === "'") {
      nextLine(text);
      const drawn = showValue(text, op.args[0]);
      if (drawn) out.push(drawn);
    } else if (op.name === '"') {
      text.wordSpacing = num(op.args, 0);
      text.charSpacing = num(op.args, 1);
      nextLine(text);
      const drawn = showValue(text, op.args[2]);
      if (drawn) out.push(drawn);
    }
  }
  return out.join("\n");
}

function replaceContents(page: PDFPage, content: string): void {
  const stream = page.node.context.flateStream(content);
  const ref = page.node.context.register(stream);
  page.node.set(PDFName.of("Contents"), ref);
}

function dropFonts(resources: PDFDict | undefined): void {
  if (!resources?.has(PDFName.of("Font"))) return;
  resources.delete(PDFName.of("Font"));
}

function hasLiveText(content: string): boolean {
  return /(?:^|[\s])(?:BT|ET|Tf|Tj|TJ|T\*|Td|TD|Tm|Tc|Tw|Tz|TL|Tr|Ts)(?:$|[\s])/.test(content);
}

export function assertNoLiveText(page: PDFPage): void {
  const resources = page.node.Resources();
  const fonts = resources?.lookupMaybe(PDFName.of("Font"), PDFDict);
  if (fonts && fonts.keys().length > 0) {
    throw new OutlineFailed("Outlined page still has a Font resource.");
  }
  if (hasLiveText(decodePageContents(page))) {
    throw new OutlineFailed("Outlined page still has live text operators.");
  }
}

export async function outlinePage(page: PDFPage): Promise<void> {
  page.node.normalize();
  const content = decodePageContents(page);
  if (!content.trim()) return;
  const rewritten = await rewriteContent(content, page.node.Resources(), new Map());
  replaceContents(page, rewritten);
  dropFonts(page.node.Resources());
  assertNoLiveText(page);
}

export async function outlineSourcePages(doc: PDFDocument, pageIndices: readonly number[]): Promise<void> {
  const unique = [...new Set(pageIndices)];
  for (const index of unique) {
    await outlinePage(doc.getPage(index));
  }
}

