// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";

const { render, getViewport } = vi.hoisted(() => ({
  render: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })),
  getViewport: vi.fn(({ scale }: { scale: number; rotation: number }) => ({ width: 600 * scale, height: 800 * scale })),
}));
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({ promise: Promise.resolve({
    getPage: async () => ({
      rotate: 90,
      getViewport,
      render,
    }),
  }) }),
}));
import { clearRenderCache, renderPageToCanvas } from "./render";

beforeEach(() => { clearRenderCache(); render.mockClear(); getViewport.mockClear(); });

it.each([
  { name: "View on Retina", width: 720, scale: 1.2, ratio: 2, fitWidth: false },
  { name: "Organize on Retina", width: 400, scale: 0.25, ratio: 2, fitWidth: true },
  { name: "narrow View", width: 350, scale: 1.2, ratio: 1, fitWidth: false },
])("renders enough pixels for $name without enlarging the CSS size", async ({ width, scale, ratio, fitWidth }) => {
  const canvas = document.createElement("canvas");
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ width } as DOMRect);
  vi.spyOn(canvas, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
  await renderPageToCanvas("test", new Uint8Array(), 0, canvas, { scale, rotation: 0, pixelRatio: ratio, fitWidth });
  expect(canvas.width).toBe(width * ratio);
  expect(getViewport).toHaveBeenCalledWith({ scale, rotation: 90 });
  expect(canvas.height).toBe(Math.ceil(width * ratio * 800 / 600));
  expect(canvas.style.width).toBe(fitWidth ? "" : `${600 * scale}px`);
  expect(render).toHaveBeenCalledWith(expect.objectContaining({
    transform: [width * ratio / (600 * scale), 0, 0, width * ratio / (600 * scale), 0, 0],
  }));
});
