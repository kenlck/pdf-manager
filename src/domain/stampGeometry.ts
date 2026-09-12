import type { DisplayNormRect, Rotation } from "./types";

export const MIN_NORM_SIDE = 0.04;
export const DEFAULT_STAMP_WIDTH = 0.35;

const EPS = 1e-6;
const FALLBACK_ASPECT = 2.5;

export function displayNormRect(input: {
  x: number;
  y: number;
  w: number;
  h: number;
}): DisplayNormRect {
  const { x, y, w, h } = input;
  if (![x, y, w, h].every(Number.isFinite)) {
    throw new Error("DisplayNormRect requires finite x, y, w, h.");
  }
  const width = Math.min(1, Math.max(w, MIN_NORM_SIDE));
  const height = Math.min(1, Math.max(h, MIN_NORM_SIDE));
  const nextX = Math.min(Math.max(x, 0), 1 - width);
  const nextY = Math.min(Math.max(y, 0), 1 - height);
  return {
    x: nextX,
    y: nextY,
    w: width,
    h: height,
    __brand: "DisplayNormRect",
  };
}

export function defaultStampRect(aspectWidthOverHeight: number): DisplayNormRect {
  const aspect =
    Number.isFinite(aspectWidthOverHeight) && aspectWidthOverHeight > 0
      ? aspectWidthOverHeight
      : FALLBACK_ASPECT;
  const w = DEFAULT_STAMP_WIDTH;
  const h = w / aspect;
  return displayNormRect({
    x: (1 - w) / 2,
    y: (1 - h) / 2,
    w,
    h,
  });
}

export function rotateDisplayRect(
  rect: DisplayNormRect,
  delta: 90 | -90,
): DisplayNormRect {
  if (delta === 90) {
    return displayNormRect({
      x: 1 - rect.y - rect.h,
      y: rect.x,
      w: rect.h,
      h: rect.w,
    });
  }
  return displayNormRect({
    x: rect.y,
    y: 1 - rect.x - rect.w,
    w: rect.h,
    h: rect.w,
  });
}

export function rectsEqual(a: DisplayNormRect, b: DisplayNormRect): boolean {
  return (
    Math.abs(a.x - b.x) < EPS &&
    Math.abs(a.y - b.y) < EPS &&
    Math.abs(a.w - b.w) < EPS &&
    Math.abs(a.h - b.h) < EPS
  );
}

export type PdfDrawImageArgs = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotate: number;
};

export type PdfPageBox = {
  cropWidth: number;
  cropHeight: number;
  rotation: Rotation;
};

function displayPointToPdf(
  dx: number,
  dy: number,
  page: PdfPageBox,
): { x: number; y: number } {
  const { cropWidth, cropHeight, rotation } = page;
  let ux: number;
  let uy: number;
  switch (rotation) {
    case 0:
      ux = dx;
      uy = dy;
      break;
    case 90:
      ux = dy;
      uy = cropHeight - dx;
      break;
    case 180:
      ux = cropWidth - dx;
      uy = cropHeight - dy;
      break;
    case 270:
      ux = cropWidth - dy;
      uy = dx;
      break;
  }
  return { x: ux, y: cropHeight - uy };
}

export function displayedRectToPdfDrawImage(
  rect: DisplayNormRect,
  page: PdfPageBox,
): PdfDrawImageArgs {
  const swapped = page.rotation === 90 || page.rotation === 270;
  const vw = swapped ? page.cropHeight : page.cropWidth;
  const vh = swapped ? page.cropWidth : page.cropHeight;
  const dx = rect.x * vw;
  const dy = rect.y * vh;
  const width = rect.w * vw;
  const height = rect.h * vh;
  const origin = displayPointToPdf(dx, dy + height, page);
  return {
    x: origin.x,
    y: origin.y,
    width,
    height,
    rotate: -page.rotation,
  };
}

export function aspectFromPixelSize(size: {
  width: number;
  height: number;
}): number {
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height) || size.height <= 0) {
    return FALLBACK_ASPECT;
  }
  return size.width / size.height;
}
