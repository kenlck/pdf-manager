import { asSignatureId, type SignatureId } from "../domain/types";

export type SignatureKind = "drawn" | "imported";

export type PixelSize = { width: number; height: number };

export type SignatureInfo = {
  id: SignatureId;
  kind: SignatureKind;
  createdAt: number;
  pixelSize: PixelSize;
};

export type Vault = {
  readonly entries: readonly SignatureInfo[];
};

export type VaultError =
  | { kind: "unsupportedType" }
  | { kind: "tooLarge" }
  | { kind: "undecodable" }
  | { kind: "quota" };

export type VaultResult<T> = { ok: true; value: T } | { ok: false; error: VaultError };

const STORAGE_KEY = "pdf-manager.signatures.v1";
const MAX_ENTRIES = 20;
const MAX_BYTES = 512_000;
const MAX_SIDE = 2000;

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

type VaultWire = {
  v: 1;
  signatures: Array<{
    id: string;
    createdAt: number;
    kind: "drawn" | "imported";
    width: number;
    height: number;
    pngDataUrl: string;
  }>;
};

let pixels = new Map<SignatureId, Uint8Array>();
let entries: SignatureInfo[] = [];

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

function isPng(bytes: Uint8Array): boolean {
  if (bytes.length < 24) {
    return false;
  }
  return PNG_MAGIC.every((value, index) => bytes[index] === value);
}

function pngPixelSize(bytes: Uint8Array): PixelSize | null {
  if (!isPng(bytes)) {
    return null;
  }
  const type = String.fromCharCode(
    bytes[12],
    bytes[13],
    bytes[14],
    bytes[15],
  );
  if (type !== "IHDR") {
    return null;
  }
  const width = readU32(bytes, 16);
  const height = readU32(bytes, 20);
  if (width < 1 || height < 1 || !Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }
  return { width, height };
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array | null {
  try {
    if (typeof Buffer !== "undefined") {
      return new Uint8Array(Buffer.from(base64, "base64"));
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function pngDataUrl(bytes: Uint8Array): string {
  return `data:image/png;base64,${bytesToBase64(bytes)}`;
}

function parsePngDataUrl(url: string): Uint8Array | null {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(url);
  if (!match) {
    return null;
  }
  return base64ToBytes(match[1]);
}

function readStorage(): string | null {
  try {
    if (typeof localStorage === "undefined") {
      return null;
    }
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStorage(value: string): boolean {
  try {
    if (typeof localStorage === "undefined") {
      return true;
    }
    localStorage.setItem(STORAGE_KEY, value);
    return true;
  } catch {
    return false;
  }
}

function snapshot(): Vault {
  return { entries: entries.map((entry) => ({ ...entry, pixelSize: { ...entry.pixelSize } })) };
}

function persist(): VaultResult<Vault> {
  const wire: VaultWire = {
    v: 1,
    signatures: entries.map((entry) => {
      const png = pixels.get(entry.id);
      return {
        id: entry.id,
        createdAt: entry.createdAt,
        kind: entry.kind,
        width: entry.pixelSize.width,
        height: entry.pixelSize.height,
        pngDataUrl: png ? pngDataUrl(png) : "",
      };
    }),
  };
  if (!writeStorage(JSON.stringify(wire))) {
    return { ok: false, error: { kind: "quota" } };
  }
  return { ok: true, value: snapshot() };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseWire(raw: unknown): void {
  pixels = new Map();
  entries = [];
  if (!isRecord(raw) || raw.v !== 1 || !Array.isArray(raw.signatures)) {
    return;
  }
  for (const item of raw.signatures) {
    if (!isRecord(item)) {
      continue;
    }
    if (
      typeof item.id !== "string" ||
      typeof item.createdAt !== "number" ||
      !Number.isFinite(item.createdAt) ||
      (item.kind !== "drawn" && item.kind !== "imported") ||
      typeof item.width !== "number" ||
      typeof item.height !== "number" ||
      typeof item.pngDataUrl !== "string"
    ) {
      continue;
    }
    const png = parsePngDataUrl(item.pngDataUrl);
    if (!png) {
      continue;
    }
    const size = pngPixelSize(png);
    if (!size || png.length > MAX_BYTES || size.width > MAX_SIDE || size.height > MAX_SIDE) {
      continue;
    }
    if (entries.length >= MAX_ENTRIES) {
      break;
    }
    const id = asSignatureId(item.id);
    pixels.set(id, png);
    entries.push({
      id,
      kind: item.kind,
      createdAt: item.createdAt,
      pixelSize: size,
    });
  }
}

function acceptPng(png: Uint8Array, kind: SignatureKind): VaultResult<SignatureId> {
  const size = pngPixelSize(png);
  if (!size) {
    return { ok: false, error: { kind: "undecodable" } };
  }
  if (png.length > MAX_BYTES || size.width > MAX_SIDE || size.height > MAX_SIDE) {
    return { ok: false, error: { kind: "tooLarge" } };
  }
  if (entries.length >= MAX_ENTRIES) {
    return { ok: false, error: { kind: "quota" } };
  }
  const id = asSignatureId(`sig-${crypto.randomUUID()}`);
  const info: SignatureInfo = {
    id,
    kind,
    createdAt: Date.now(),
    pixelSize: size,
  };
  const previousEntries = entries;
  const previousPixels = pixels;
  entries = [...entries, info];
  pixels = new Map(pixels);
  pixels.set(id, png.slice());
  const saved = persist();
  if (!saved.ok) {
    entries = previousEntries;
    pixels = previousPixels;
    return saved;
  }
  return { ok: true, value: id };
}

async function rasterizeJpeg(bytes: Uint8Array): Promise<VaultResult<Uint8Array>> {
  if (typeof createImageBitmap !== "function") {
    return { ok: false, error: { kind: "undecodable" } };
  }
  try {
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/jpeg" }));
    const canvas =
      typeof OffscreenCanvas === "function"
        ? new OffscreenCanvas(bitmap.width, bitmap.height)
        : null;
    if (!canvas) {
      bitmap.close();
      return { ok: false, error: { kind: "undecodable" } };
    }
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return { ok: false, error: { kind: "undecodable" } };
    }
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await canvas.convertToBlob({ type: "image/png" });
    return { ok: true, value: new Uint8Array(await blob.arrayBuffer()) };
  } catch {
    return { ok: false, error: { kind: "undecodable" } };
  }
}

export function loadVault(): Vault {
  const raw = readStorage();
  if (raw === null) {
    pixels = new Map();
    entries = [];
    return snapshot();
  }
  try {
    parseWire(JSON.parse(raw));
  } catch {
    pixels = new Map();
    entries = [];
  }
  return snapshot();
}

export function addDrawn(png: Uint8Array, pixelSize: PixelSize): VaultResult<SignatureId> {
  if (
    !Number.isFinite(pixelSize.width) ||
    !Number.isFinite(pixelSize.height) ||
    pixelSize.width < 1 ||
    pixelSize.height < 1
  ) {
    return { ok: false, error: { kind: "undecodable" } };
  }
  return acceptPng(png, "drawn");
}

export async function addImported(bytes: Uint8Array, mime: string): Promise<VaultResult<SignatureId>> {
  if (mime !== "image/png" && mime !== "image/jpeg") {
    return { ok: false, error: { kind: "unsupportedType" } };
  }
  if (mime === "image/png") {
    return acceptPng(bytes, "imported");
  }
  const raster = await rasterizeJpeg(bytes);
  if (!raster.ok) {
    return raster;
  }
  return acceptPng(raster.value, "imported");
}

export function removeSignature(id: SignatureId): Vault {
  entries = entries.filter((entry) => entry.id !== id);
  pixels = new Map(pixels);
  pixels.delete(id);
  persist();
  return snapshot();
}

export function pngOf(vault: Vault, id: SignatureId): Uint8Array | null {
  if (!vault.entries.some((entry) => entry.id === id)) {
    return null;
  }
  const png = pixels.get(id);
  return png ? png.slice() : null;
}

export function infoOf(vault: Vault, id: SignatureId): SignatureInfo {
  const info = vault.entries.find((entry) => entry.id === id);
  if (!info) {
    throw new Error(`Unknown signature ${id}`);
  }
  return info;
}
