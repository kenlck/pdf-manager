import { displayNormRect, MIN_NORM_SIDE } from "../domain/stampGeometry";
import type { MarkupContent, MarkupPoint, MarkupTool, Stamp } from "../domain/types";
import { mintStampId } from "../domain/types";

export type MarkupStyle = { color: string; strokeWidth: number; fill: string; fontSize: number };
export const DEFAULT_STYLE: MarkupStyle = { color: "#202938", strokeWidth: 3, fill: "none", fontSize: 24 };

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[char]!);
}

/** One artwork description drives thumbnails, the editor, and the saved PDF. */
export function artworkSvg(content: MarkupContent): string {
  const { width, height } = content;
  const color = escapeXml(content.color);
  let body: string;
  if (content.kind === "text") {
    body = `<g fill="${color}" font-family="Arial, sans-serif" font-size="${content.fontSize}" xml:space="preserve">${content.text.split("\n").map((line, i) =>
      `<text x="4" y="${4 + content.fontSize * (1 + i * 1.25)}">${escapeXml(line)}</text>`).join("")}</g>`;
  } else {
    const stroke = `stroke="${color}" stroke-width="${content.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"`;
    const inset = content.strokeWidth / 2 + 1;
    if (content.kind === "rectangle") {
      body = `<rect x="${inset}" y="${inset}" width="${Math.max(0, width - inset * 2)}" height="${Math.max(0, height - inset * 2)}" fill="${escapeXml(content.fill)}" ${stroke}/>`;
    } else if (content.kind === "ellipse") {
      body = `<ellipse cx="${width / 2}" cy="${height / 2}" rx="${Math.max(0, width / 2 - inset)}" ry="${Math.max(0, height / 2 - inset)}" fill="${escapeXml(content.fill)}" ${stroke}/>`;
    } else {
      const points = "points" in content ? content.points : [];
      body = points.length === 1
        ? `<circle cx="${points[0].x}" cy="${points[0].y}" r="${content.strokeWidth / 2}" fill="${color}"/>`
        : `<polyline points="${points.map((p) => `${p.x},${p.y}`).join(" ")}" fill="none" ${stroke}/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
}

export function artworkUrl(content: MarkupContent): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(artworkSvg(content))}`;
}

export function textContent(text: string, fontSize: number, color: string): MarkupContent {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) throw new Error("Could not create text artwork.");
  context.font = `${fontSize}px Arial, sans-serif`;
  const lines = text.split("\n");
  return {
    kind: "text", text, fontSize, color,
    width: lines.reduce((width, line) => Math.max(width, context.measureText(line).width + 8), 40),
    height: Math.max(fontSize * 1.25 * lines.length + 8, 32),
  };
}

/** Points and artwork sizes use a stable 800-unit page width at any window size. */
export function drawnStamp(tool: Exclude<MarkupTool, "select">, points: readonly MarkupPoint[], pageHeight: number, style: MarkupStyle): Stamp {
  const start = points[0];
  const end = points[points.length - 1];
  const path = tool === "pencil" ? points : [start, end];
  const pad = style.strokeWidth / 2 + 1;
  // Avoid spreading a long freehand stroke into function arguments.
  const bounds = path.reduce((b, p) => ({ left: Math.min(b.left, p.x), right: Math.max(b.right, p.x), top: Math.min(b.top, p.y), bottom: Math.max(b.bottom, p.y) }),
    { left: start.x, right: start.x, top: start.y, bottom: start.y });
  const w = Math.min(800, Math.max(bounds.right - bounds.left + pad * 2, 800 * MIN_NORM_SIDE));
  const h = Math.min(pageHeight, Math.max(bounds.bottom - bounds.top + pad * 2, pageHeight * MIN_NORM_SIDE));
  const x = Math.max(0, Math.min(bounds.left - pad, 800 - w));
  const y = Math.max(0, Math.min(bounds.top - pad, pageHeight - h));
  const base = { width: w, height: h, color: style.color, strokeWidth: style.strokeWidth };
  const content: MarkupContent = tool === "rectangle" || tool === "ellipse"
    ? { ...base, kind: tool, fill: style.fill }
    : { ...base, kind: tool, points: path.map((p) => ({ x: p.x - x, y: p.y - y })) };
  return { id: mintStampId(), rect: displayNormRect({ x: x / 800, y: y / pageHeight, w: w / 800, h: h / pageHeight }), content };
}

export async function rasterizeArtwork(content: MarkupContent, width: number, height: number): Promise<Uint8Array> {
  const image = new Image();
  image.src = artworkUrl(content);
  await image.decode();
  const canvas = document.createElement("canvas");
  const scale = Math.min(3, 4096 / Math.max(width, height));
  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not render markup for export.");
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Could not export markup.")), "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}
