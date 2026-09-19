import { describe, expect, it } from "vitest";
import { concatSpans, glyphAtlas, parseContent, writeContent } from "./content";
import type { FaceKey, OutlineFont } from "./font";

const latin1 = (text: string) => Uint8Array.from(text, (ch) => ch.charCodeAt(0) & 0xff);
const decode = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes);

function stubFont(width: number): OutlineFont {
  return {
    key: "stub" as FaceKey,
    decode: (bytes) => Array.from(bytes),
    width: () => width,
    isWordSpace: (code) => code === 32,
    art: (code) =>
      code === 32
        ? null
        : {
            kind: "outline",
            ops: latin1("0 0 m 1 0 l 1 1 l h\n"),
            bbox: [0, 0, 1, 1],
            path: [],
            unitsPerEm: 1000,
          },
  };
}

describe("outline content", () => {
  it("partitions a stream so concatenating spans restores the bytes", () => {
    const bytes = latin1("q 1 0 0 1 0 0 cm BT /F1 12 Tf 1 0 0 1 72 720 Tm (Hi) Tj ET Q");
    expect(concatSpans(parseContent(bytes))).toEqual(bytes);
  });

  it("advances from the font width, not from outline bounds", () => {
    const spans = parseContent(latin1("BT /F1 10 Tf 1 0 0 1 20 100 Tm (HI) Tj ET"));
    const { bytes } = writeContent(spans, () => stubFont(1), glyphAtlas());
    expect(decode(bytes)).toBe(
      "q 10 0 0 10 20 100 cm /Gl0 Do Q\nq 10 0 0 10 30 100 cm /Gl1 Do Q\n",
    );
  });

  it("leaves non-text operators untouched", () => {
    const bytes = latin1("0.1 0.2 0.3 rg 10 10 20 20 re f");
    const spans = parseContent(bytes);
    const lowered = writeContent(spans, () => stubFont(1), glyphAtlas());
    expect(lowered.bytes).toEqual(bytes);
    expect(lowered.places.size).toBe(0);
  });
});
