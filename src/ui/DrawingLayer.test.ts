/** @vitest-environment jsdom */
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { DrawingLayer } from "./DrawingLayer";
import { DEFAULT_STYLE } from "../markup/artwork";
import type { MarkupTool } from "../domain/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let cleanup = () => {};
afterEach(() => cleanup());
function setup(tool: Exclude<MarkupTool, "select">) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const place = vi.fn();
  act(() => root.render(createElement(DrawingLayer, { tool, style: DEFAULT_STYLE, onPlace: place })));
  const layer = host.firstElementChild as HTMLElement;
  layer.setPointerCapture = vi.fn();
  layer.releasePointerCapture = vi.fn();
  layer.getBoundingClientRect = () => ({ left: 10, top: 20, width: 400, height: 500 }) as DOMRect;
  cleanup = () => { act(() => root.unmount()); host.remove(); };
  function pointer(type: string, x: number, y: number) {
    const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperty(event, "pointerId", { value: 1 });
    act(() => layer.dispatchEvent(event));
  }
  return { place, pointer, layer };
}

it.each(["pencil", "rectangle", "ellipse", "line"] as const)("commits %s only once at pointer-up, including the final point", (tool) => {
  const { place, pointer } = setup(tool);
  pointer("pointerdown", 20, 30);
  pointer("pointermove", 60, 80);
  pointer("pointermove", 120, 130);
  expect(place).not.toHaveBeenCalled();
  pointer("pointerup", 210, 220);
  expect(place).toHaveBeenCalledTimes(1);
  expect(place.mock.calls[0][0].content.kind).toBe(tool);
  expect(place.mock.calls[0][0].rect.w).toBeGreaterThan(0.47);
});

it("discards a cancelled stroke instead of committing partial artwork", () => {
  const { place, pointer, layer } = setup("pencil");
  pointer("pointerdown", 20, 30);
  pointer("pointermove", 100, 100);
  expect(layer.querySelector("img")).not.toBeNull();
  pointer("pointercancel", 100, 100);
  pointer("pointerup", 100, 100);
  expect(place).not.toHaveBeenCalled();
  expect(layer.querySelector("img")).toBeNull();
});
