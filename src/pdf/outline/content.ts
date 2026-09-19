import type { GlyphForm, OutlineFont } from "./font";
import type { PathCommand } from "./glyphs";

export type Matrix = readonly [number, number, number, number, number, number];

export type Span =
  | { readonly kind: "opaque"; readonly bytes: Uint8Array }
  | { readonly kind: "text"; readonly source: Uint8Array; readonly items: readonly TextItem[] };

export type ShowPart =
  | { readonly kind: "codes"; readonly bytes: Uint8Array }
  | { readonly kind: "adjust"; readonly thousandths: number };

export type RenderMode = { readonly paint: "f" | "S" | "B" | null; readonly clip: boolean };

export type TextItem =
  | { readonly op: "font"; readonly resource: string; readonly size: number }
  | { readonly op: "matrix"; readonly m: Matrix }
  | { readonly op: "offset"; readonly tx: number; readonly ty: number }
  | { readonly op: "newline" }
  | { readonly op: "leading"; readonly points: number }
  | { readonly op: "charSpace"; readonly points: number }
  | { readonly op: "wordSpace"; readonly points: number }
  | { readonly op: "rise"; readonly points: number }
  | { readonly op: "hScale"; readonly factor: number }
  | { readonly op: "renderMode"; readonly mode: RenderMode }
  | { readonly op: "show"; readonly parts: readonly ShowPart[] }
  | { readonly op: "opaque"; readonly bytes: Uint8Array };

export type PlacedGlyph = {
  readonly form: GlyphForm;
  readonly paint: "f" | "S" | "B";
};

export type GlyphAtlas = {
  place(font: OutlineFont, code: number, paint: "f" | "S" | "B"): string | null;
  readonly forms: ReadonlyMap<string, PlacedGlyph>;
};

export type Lowered = {
  readonly bytes: Uint8Array;
  readonly places: ReadonlySet<string>;
};

const latin1 = new TextDecoder("latin1");
const encode = new TextEncoder();
const WS = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIM = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);

type Token =
  | { readonly t: "string"; readonly bytes: Uint8Array; readonly start: number; readonly end: number }
  | { readonly t: "name"; readonly value: string; readonly start: number; readonly end: number }
  | { readonly t: "number"; readonly value: number; readonly start: number; readonly end: number }
  | { readonly t: "op"; readonly value: string; readonly start: number; readonly end: number }
  | { readonly t: "punct"; readonly value: string; readonly start: number; readonly end: number };

function unhex(bytes: Uint8Array): Uint8Array {
  const digits: number[] = [];
  for (const code of bytes) {
    const digit =
      code >= 0x30 && code <= 0x39
        ? code - 0x30
        : code >= 0x41 && code <= 0x46
          ? code - 55
          : code >= 0x61 && code <= 0x66
            ? code - 87
            : -1;
    if (digit >= 0) digits.push(digit);
  }
  if (digits.length % 2) digits.push(0);
  const out = new Uint8Array(digits.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = digits[i * 2] * 16 + digits[i * 2 + 1];
  return out;
}

function unescapeLiteral(bytes: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < bytes.length; i += 1) {
    if (bytes[i] !== 0x5c) {
      out.push(bytes[i]);
      continue;
    }
    const next = bytes[++i];
    const simple: Record<number, number> = { 0x6e: 10, 0x72: 13, 0x74: 9, 0x62: 8, 0x66: 12 };
    if (simple[next] !== undefined) {
      out.push(simple[next]);
      continue;
    }
    if (next >= 0x30 && next <= 0x37) {
      let value = next - 0x30;
      for (let k = 0; k < 2 && bytes[i + 1] >= 0x30 && bytes[i + 1] <= 0x37; k += 1) {
        value = value * 8 + (bytes[++i] - 0x30);
      }
      out.push(value & 0xff);
      continue;
    }
    if (next === 0x0d && bytes[i + 1] === 0x0a) i += 1;
    else if (next !== 0x0a && next !== 0x0d) out.push(next);
  }
  return Uint8Array.from(out);
}

function skipInlineImage(bytes: Uint8Array, from: number, to: number): number {
  let i = from;
  while (i < to) {
    while (i < to && WS.has(bytes[i])) i += 1;
    if (bytes[i] === 0x49 && bytes[i + 1] === 0x44 && (i + 2 >= to || WS.has(bytes[i + 2]) || DELIM.has(bytes[i + 2]))) {
      i += 2;
      if (i < to && WS.has(bytes[i])) i += 1;
      break;
    }
    i += 1;
  }
  while (i + 1 < to) {
    if (
      bytes[i] === 0x45 &&
      bytes[i + 1] === 0x49 &&
      (i + 2 >= to || WS.has(bytes[i + 2]) || DELIM.has(bytes[i + 2]))
    ) {
      return i + 2;
    }
    i += 1;
  }
  return to;
}

function* tokens(bytes: Uint8Array, from: number, to: number): Generator<Token> {
  let i = from;
  while (i < to) {
    const code = bytes[i];
    if (WS.has(code)) {
      i += 1;
      continue;
    }
    const start = i;
    if (code === 0x25) {
      while (i < to && bytes[i] !== 0x0a && bytes[i] !== 0x0d) i += 1;
      continue;
    }
    if (code === 0x28) {
      let depth = 1;
      i += 1;
      const body = i;
      while (i < to && depth > 0) {
        if (bytes[i] === 0x5c) {
          i += 2;
          continue;
        }
        if (bytes[i] === 0x28) depth += 1;
        if (bytes[i] === 0x29) depth -= 1;
        i += 1;
      }
      yield { t: "string", bytes: unescapeLiteral(bytes.subarray(body, i - 1)), start, end: i };
      continue;
    }
    if (code === 0x3c && bytes[i + 1] !== 0x3c) {
      i += 1;
      const body = i;
      while (i < to && bytes[i] !== 0x3e) i += 1;
      yield { t: "string", bytes: unhex(bytes.subarray(body, i)), start, end: ++i };
      continue;
    }
    if (code === 0x3c || code === 0x3e) {
      i += 2;
      yield { t: "punct", value: latin1.decode(bytes.subarray(start, i)), start, end: i };
      continue;
    }
    if (code === 0x2f) {
      i += 1;
      while (i < to && !WS.has(bytes[i]) && !DELIM.has(bytes[i])) i += 1;
      yield { t: "name", value: latin1.decode(bytes.subarray(start + 1, i)), start, end: i };
      continue;
    }
    if (code === 0x5b || code === 0x5d || code === 0x7b || code === 0x7d) {
      i += 1;
      yield { t: "punct", value: String.fromCharCode(code), start, end: i };
      continue;
    }
    while (i < to && !WS.has(bytes[i]) && !DELIM.has(bytes[i])) i += 1;
    const text = latin1.decode(bytes.subarray(start, i));
    if (text === "BI") {
      i = skipInlineImage(bytes, i, to);
      continue;
    }
    if (/^[-+.\d]/.test(text)) yield { t: "number", value: Number.parseFloat(text) || 0, start, end: i };
    else yield { t: "op", value: text, start, end: i };
  }
}

export function renderMode(tr: number): RenderMode {
  const mode = ((tr % 8) + 8) % 8;
  const paint = mode % 4 === 0 ? "f" : mode % 4 === 1 ? "S" : mode % 4 === 2 ? "B" : null;
  return { paint: mode >= 4 || mode % 4 !== 3 ? paint : null, clip: mode >= 4 };
}

function parseTextObject(bytes: Uint8Array, from: number): { items: TextItem[]; end: number; closed: boolean } {
  const items: TextItem[] = [];
  const operands: Token[] = [];
  let opaqueFrom = from;
  const flush = (upTo: number) => {
    if (upTo > opaqueFrom) items.push({ op: "opaque", bytes: bytes.subarray(opaqueFrom, upTo) });
  };
  const n = (k: number) => {
    const token = operands[operands.length - k];
    return token && token.t === "number" ? token.value : 0;
  };
  const nameAt = (k: number) => {
    const token = operands[operands.length - k];
    return token && token.t === "name" ? token.value : "";
  };
  const stringAt = (k: number) => {
    const token = operands[operands.length - k];
    return token && token.t === "string" ? token.bytes : new Uint8Array();
  };
  for (const tok of tokens(bytes, from, bytes.length)) {
    if (tok.t !== "op") {
      operands.push(tok);
      continue;
    }
    const start = operands[0]?.start ?? tok.start;
    const finish = (item: TextItem | readonly TextItem[]) => {
      flush(start);
      if (Array.isArray(item)) items.push(...item);
      else items.push(item as TextItem);
      opaqueFrom = tok.end;
    };
    switch (tok.value) {
      case "ET":
        flush(tok.start);
        return { items, end: tok.end, closed: true };
      case "Tf":
        finish({ op: "font", resource: nameAt(2), size: n(1) });
        break;
      case "Tm":
        finish({ op: "matrix", m: [n(6), n(5), n(4), n(3), n(2), n(1)] });
        break;
      case "Td":
        finish({ op: "offset", tx: n(2), ty: n(1) });
        break;
      case "TD":
        finish([
          { op: "leading", points: -n(1) },
          { op: "offset", tx: n(2), ty: n(1) },
        ]);
        break;
      case "TL":
        finish({ op: "leading", points: n(1) });
        break;
      case "Tc":
        finish({ op: "charSpace", points: n(1) });
        break;
      case "Tw":
        finish({ op: "wordSpace", points: n(1) });
        break;
      case "Tz":
        finish({ op: "hScale", factor: n(1) / 100 });
        break;
      case "Ts":
        finish({ op: "rise", points: n(1) });
        break;
      case "Tr":
        finish({ op: "renderMode", mode: renderMode(n(1)) });
        break;
      case "T*":
        finish({ op: "newline" });
        break;
      case "Tj":
        finish({ op: "show", parts: [{ kind: "codes", bytes: stringAt(1) }] });
        break;
      case "'":
        finish([
          { op: "newline" },
          {
            op: "show",
            parts: [{ kind: "codes", bytes: stringAt(1) }],
          },
        ]);
        break;
      case '"':
        finish([
          { op: "wordSpace", points: n(3) },
          { op: "charSpace", points: n(2) },
          { op: "newline" },
          {
            op: "show",
            parts: [{ kind: "codes", bytes: stringAt(1) }],
          },
        ]);
        break;
      case "TJ": {
        const parts: ShowPart[] = [];
        for (const operand of operands) {
          if (operand.t === "string") parts.push({ kind: "codes", bytes: operand.bytes });
          else if (operand.t === "number") parts.push({ kind: "adjust", thousandths: operand.value });
        }
        finish({ op: "show", parts });
        break;
      }
      default:
        break;
    }
    operands.length = 0;
  }
  flush(bytes.length);
  return { items, end: bytes.length, closed: false };
}

export function parseContent(bytes: Uint8Array): readonly Span[] {
  const spans: Span[] = [];
  let opaqueFrom = 0;
  let from = 0;
  while (from < bytes.length) {
    let bt: Token | undefined;
    for (const tok of tokens(bytes, from, bytes.length)) {
      if (tok.t === "op" && tok.value === "BT") {
        bt = tok;
        break;
      }
    }
    if (!bt) break;
    const block = parseTextObject(bytes, bt.end);
    if (!block.closed) break;
    spans.push({ kind: "opaque", bytes: bytes.subarray(opaqueFrom, bt.start) });
    spans.push({ kind: "text", source: bytes.subarray(bt.start, block.end), items: block.items });
    opaqueFrom = block.end;
    from = block.end;
  }
  spans.push({ kind: "opaque", bytes: bytes.subarray(opaqueFrom) });
  return spans;
}

export function glyphAtlas(): GlyphAtlas {
  const names = new Map<string, string | null>();
  const forms = new Map<string, PlacedGlyph>();
  return {
    forms,
    place(font, code, paint) {
      const key = `${font.key}\0${code}\0${paint}`;
      if (names.has(key)) return names.get(key) ?? null;
      const art = font.art(code);
      if (!art) {
        names.set(key, null);
        return null;
      }
      const name = `Gl${forms.size}`;
      forms.set(name, { form: art, paint });
      names.set(key, name);
      return name;
    },
  };
}

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

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

function num(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(5).replace(/0+$/, "").replace(/\.$/, "");
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

function apply(matrix: Matrix, x: number, y: number): readonly [number, number] {
  return [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]];
}

function clipPath(path: readonly PathCommand[], matrix: Matrix): string {
  const parts: string[] = [];
  let px = 0;
  let py = 0;
  for (const { command, args } of path) {
    if (command === "moveTo") {
      const [x, y] = apply(matrix, args[0], args[1]);
      parts.push(`${num(x)} ${num(y)} m`);
      px = x;
      py = y;
    } else if (command === "lineTo") {
      const [x, y] = apply(matrix, args[0], args[1]);
      parts.push(`${num(x)} ${num(y)} l`);
      px = x;
      py = y;
    } else if (command === "quadraticCurveTo") {
      const [cx, cy] = apply(matrix, args[0], args[1]);
      const [x, y] = apply(matrix, args[2], args[3]);
      const x1 = px + (2 / 3) * (cx - px);
      const y1 = py + (2 / 3) * (cy - py);
      const x2 = x + (2 / 3) * (cx - x);
      const y2 = y + (2 / 3) * (cy - y);
      parts.push(`${num(x1)} ${num(y1)} ${num(x2)} ${num(y2)} ${num(x)} ${num(y)} c`);
      px = x;
      py = y;
    } else if (command === "bezierCurveTo") {
      const [x1, y1] = apply(matrix, args[0], args[1]);
      const [x2, y2] = apply(matrix, args[2], args[3]);
      const [x, y] = apply(matrix, args[4], args[5]);
      parts.push(`${num(x1)} ${num(y1)} ${num(x2)} ${num(y2)} ${num(x)} ${num(y)} c`);
      px = x;
      py = y;
    } else if (command === "closePath") {
      parts.push("h");
    }
  }
  return parts.join(" ");
}

function ascii(text: string): Uint8Array {
  return encode.encode(text);
}

function lowerTextObject(
  items: readonly TextItem[],
  fontFor: (resource: string) => OutlineFont | undefined,
  atlas: GlyphAtlas,
  places: Set<string>,
): Uint8Array {
  let tm: Matrix = IDENTITY;
  let tlm: Matrix = IDENTITY;
  let font: OutlineFont | undefined;
  let size = 0;
  let charSpace = 0;
  let wordSpace = 0;
  let hScale = 1;
  let leading = 0;
  let rise = 0;
  let mode: RenderMode = { paint: "f", clip: false };
  const out: Uint8Array[] = [];
  const clips: string[] = [];
  for (const item of items) {
    switch (item.op) {
      case "opaque":
        if (![...item.bytes].every((code) => code === 0x00 || code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d || code === 0x20)) {
          out.push(item.bytes);
        }
        break;
      case "font":
        font = fontFor(item.resource);
        size = item.size;
        break;
      case "matrix":
        tm = tlm = item.m;
        break;
      case "offset":
        tlm = mul(tlm, translate(item.tx, item.ty));
        tm = tlm;
        break;
      case "newline":
        tlm = mul(tlm, translate(0, -leading));
        tm = tlm;
        break;
      case "leading":
        leading = item.points;
        break;
      case "charSpace":
        charSpace = item.points;
        break;
      case "wordSpace":
        wordSpace = item.points;
        break;
      case "hScale":
        hScale = item.factor;
        break;
      case "rise":
        rise = item.points;
        break;
      case "renderMode":
        mode = item.mode;
        break;
      case "show": {
        if (!font) break;
        for (const part of item.parts) {
          if (part.kind === "adjust") {
            tm = mul(tm, translate((-part.thousandths / 1000) * size * hScale, 0));
            continue;
          }
          for (const code of font.decode(part.bytes)) {
            const trm = mul(tm, [size * hScale, 0, 0, size, 0, rise]);
            if (mode.paint) {
              const name = atlas.place(font, code, mode.paint);
              if (name) {
                places.add(name);
                out.push(ascii(`q ${trm.map(num).join(" ")} cm /${name} Do Q\n`));
              }
            }
            if (mode.clip) {
              const art = font.art(code);
              if (art?.kind === "outline") {
                const baked = mul(trm, [1 / art.unitsPerEm, 0, 0, 1 / art.unitsPerEm, 0, 0]);
                const path = clipPath(art.path, baked);
                if (path) clips.push(path);
              }
            }
            const advance =
              (font.width(code) * size + charSpace + (font.isWordSpace(code) ? wordSpace : 0)) * hScale;
            tm = mul(tm, translate(advance, 0));
          }
        }
        break;
      }
      default:
        break;
    }
  }
  if (clips.length) out.push(ascii(`${clips.join(" ")} W n\n`));
  return concat(out);
}

export function writeContent(
  spans: readonly Span[],
  fontFor: (resource: string) => OutlineFont | undefined,
  atlas: GlyphAtlas,
): Lowered {
  const places = new Set<string>();
  const chunks: Uint8Array[] = [];
  for (const span of spans) {
    if (span.kind === "opaque") {
      chunks.push(span.bytes);
      continue;
    }
    chunks.push(lowerTextObject(span.items, fontFor, atlas, places));
  }
  return { bytes: concat(chunks), places };
}

export function hasShowingOperator(bytes: Uint8Array): boolean {
  for (const tok of tokens(bytes, 0, bytes.length)) {
    if (tok.t === "op" && (tok.value === "Tj" || tok.value === "TJ" || tok.value === "'" || tok.value === '"')) {
      return true;
    }
  }
  return false;
}

export function concatSpans(spans: readonly Span[]): Uint8Array {
  return concat(spans.map((span) => (span.kind === "opaque" ? span.bytes : span.source)));
}
