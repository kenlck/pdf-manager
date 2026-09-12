import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addDrawn,
  addImported,
  loadVault,
  pngOf,
  removeSignature,
} from "./vault";

const PNG_1X1 = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

const STORAGE_KEY = "pdf-manager.signatures.v1";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    key(index: number) {
      return [...data.keys()][index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
  };
}

describe("signature vault", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: memoryStorage(),
    });
    loadVault();
  });

  afterEach(() => {
    loadVault();
  });

  it("returns an empty vault for garbage JSON", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(loadVault().entries).toEqual([]);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 2, signatures: [{ id: "x" }] }));
    expect(loadVault().entries).toEqual([]);
  });

  it("rejects an oversized PNG as tooLarge", () => {
    const oversized = new Uint8Array(512_001);
    oversized.set(PNG_1X1);
    const result = addDrawn(oversized, { width: 1, height: 1 });
    expect(result).toEqual({ ok: false, error: { kind: "tooLarge" } });
  });

  it("returns null from pngOf after removeSignature", () => {
    const added = addDrawn(PNG_1X1, { width: 1, height: 1 });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }
    const vault = loadVault();
    expect(pngOf(vault, added.value)?.byteLength).toBe(PNG_1X1.byteLength);
    const next = removeSignature(added.value);
    expect(pngOf(next, added.value)).toBeNull();
    expect(pngOf(loadVault(), added.value)).toBeNull();
  });

  it("treats JPEG import as undecodable when createImageBitmap is missing", async () => {
    const result = await addImported(new Uint8Array([0xff, 0xd8, 0xff]), "image/jpeg");
    expect(result).toEqual({ ok: false, error: { kind: "undecodable" } });
  });
});
