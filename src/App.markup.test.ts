/** @vitest-environment jsdom */
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import App from "./App";
import { pickImage, pickOpenDocuments } from "./shell/files";

vi.mock("./shell/files", async (original) => ({
  ...await original<typeof import("./shell/files")>(), pickImage: vi.fn(), pickOpenDocuments: vi.fn(),
}));
vi.mock("./pdf/render", () => ({ clearRenderCache: vi.fn() }));
vi.mock("./ui/usePageCanvas", () => ({ usePageCanvas: () => ({ current: null }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let cleanup = () => {};
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ measureText: (text: string) => ({ width: text.length * 12 }) } as CanvasRenderingContext2D);
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:test"), revokeObjectURL: vi.fn() }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function button(host: HTMLElement, label: string) {
  const found = Array.from(host.querySelectorAll("button")).find((el) => el.textContent === label);
  if (!found) throw new Error(`Missing ${label}`);
  return found;
}
async function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(createElement(App)));
  cleanup = () => { act(() => root.unmount()); host.remove(); };
  vi.mocked(pickOpenDocuments).mockResolvedValueOnce([{ path: "two-page.pdf", bytes: new Uint8Array(readFileSync("fixtures/two-page.pdf")) }]);
  await act(async () => button(host, "Open").click());
  return host;
}

it("inserts an image overlay without adding pages, and supports delete, undo, and redo", async () => {
  const host = await mount();
  vi.mocked(pickImage).mockResolvedValueOnce({ path: "picture.png", mime: "image/png", bytes: new Uint8Array(readFileSync("src-tauri/icons/32x32.png")) });
  await act(async () => button(host, "Image").click());
  expect(host.querySelectorAll(".page-thumb")).toHaveLength(2);
  expect(host.querySelectorAll(".page-preview .stamp")).toHaveLength(1);
  expect(host.querySelector(".page-preview .stamp img")?.getAttribute("alt")).toBe("picture.png");
  act(() => button(host, "Delete").click());
  expect(host.querySelectorAll(".page-preview .stamp")).toHaveLength(0);
  act(() => button(host, "Undo").click());
  expect(host.querySelectorAll(".page-preview .stamp")).toHaveLength(1);
  act(() => button(host, "Redo").click());
  expect(host.querySelectorAll(".page-preview .stamp")).toHaveLength(0);
});

it("keeps deletion and undo shortcuts inside the text editor, and commits text as an undoable edit", async () => {
  const host = await mount();
  act(() => button(host, "Text").click());
  const input = host.querySelector("textarea")!;
  act(() => input.focus());
  for (const key of ["Backspace", "Delete", "z"]) {
    const event = new KeyboardEvent("keydown", { key, metaKey: key === "z", bubbles: true, cancelable: true });
    act(() => input.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(false);
  }
  expect(host.querySelectorAll(".page-preview .stamp")).toHaveLength(1);
  expect(host.querySelectorAll(".page-thumb")).toHaveLength(2);
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "Edited\n中文");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => input.blur());
  expect(host.querySelector(".page-preview .stamp img")?.getAttribute("alt")).toBe("Edited\n中文");
  act(() => button(host, "Undo").click());
  expect(host.querySelector(".page-preview .stamp img")?.getAttribute("alt")).toBe("Text");
  act(() => button(host, "Redo").click());
  expect(host.querySelector(".page-preview .stamp img")?.getAttribute("alt")).toBe("Edited\n中文");
});

it("reports invalid image imports without changing the document", async () => {
  const host = await mount();
  vi.mocked(pickImage).mockResolvedValueOnce({ path: "broken.jpg", mime: "image/jpeg", bytes: new TextEncoder().encode("not an image") });
  await act(async () => button(host, "Image").click());
  expect(host.textContent).toContain("Could not insert that image");
  expect(host.querySelectorAll(".page-preview .stamp")).toHaveLength(0);
  expect(host.querySelectorAll(".page-thumb")).toHaveLength(2);
});
