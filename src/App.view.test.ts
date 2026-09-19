/** @vitest-environment jsdom */
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import App from "./App";
import { pickImage, pickOpenDocuments, pickSavePdf, writePdfBytes } from "./shell/files";
import { writePdfFromPlan } from "./pdf/write";

vi.mock("./shell/files", async (original) => ({
  ...await original<typeof import("./shell/files")>(),
  pickImage: vi.fn(),
  pickOpenDocuments: vi.fn(),
  pickSavePdf: vi.fn(),
  writePdfBytes: vi.fn(),
}));
vi.mock("./pdf/write", async (original) => ({
  ...await original<typeof import("./pdf/write")>(),
  writePdfFromPlan: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
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

function renderApp() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(createElement(App)));
  cleanup = () => { act(() => root.unmount()); host.remove(); };
  return host;
}

async function mount() {
  const host = renderApp();
  vi.mocked(pickOpenDocuments).mockResolvedValueOnce([{ path: "two-page.pdf", bytes: new Uint8Array(readFileSync("fixtures/two-page.pdf")) }]);
  await act(async () => button(host, "Open").click());
  return host;
}

it("shows every page in the view panel and prints them", async () => {
  const host = await mount();
  expect(host.querySelectorAll(".page-preview .page-stack")).toHaveLength(2);
  expect(host.querySelectorAll(".page-thumb")).toHaveLength(2);
  const print = vi.spyOn(window, "print").mockImplementation(() => {});
  await act(async () => button(host, "Print").click());
  expect(print).toHaveBeenCalledTimes(1);
  expect(host.querySelector("[data-testid=status-bar]")?.textContent).toBe("Print dialog opened.");
});

it("disables Print when no document is open", () => {
  const host = renderApp();
  expect(button(host, "Print").disabled).toBe(true);
});

it("disables both save pills when no document is open", () => {
  const host = renderApp();
  expect(button(host, "Save as").disabled).toBe(true);
  expect(button(host, "Outline & Save as").disabled).toBe(true);
});

it("saves live text and outlined text through the two pills", async () => {
  const host = await mount();
  expect(button(host, "Save as").disabled).toBe(false);
  expect(button(host, "Outline & Save as").disabled).toBe(false);
  vi.mocked(pickSavePdf).mockResolvedValueOnce("composed.pdf");
  vi.mocked(writePdfBytes).mockResolvedValue(undefined);
  await act(async () => button(host, "Save as").click());
  expect(pickSavePdf).toHaveBeenCalledWith("composed.pdf");
  expect(writePdfFromPlan).toHaveBeenCalledWith(
    expect.any(Array),
    expect.any(Map),
    expect.any(Map),
    "live",
  );
  expect(writePdfBytes).toHaveBeenCalledTimes(1);
  const liveStatus = host.querySelector("[data-testid=status-bar]")?.textContent ?? "";
  expect(liveStatus.startsWith("Saved")).toBe(true);
  expect(liveStatus.toLowerCase()).not.toContain("outline");
  vi.mocked(pickSavePdf).mockResolvedValueOnce("composed-outlined.pdf");
  await act(async () => button(host, "Outline & Save as").click());
  expect(pickSavePdf).toHaveBeenCalledWith("composed-outlined.pdf");
  expect(writePdfFromPlan).toHaveBeenLastCalledWith(
    expect.any(Array),
    expect.any(Map),
    expect.any(Map),
    "outlined",
  );
  expect(writePdfBytes).toHaveBeenCalledTimes(2);
  expect(host.querySelector("[data-testid=status-bar]")?.textContent).toMatch(
    /Saved .+\. Page text is now outlines and is no longer searchable\./,
  );
});

it("inserts an image overlay onto one of two mounted preview stacks", async () => {
  const host = await mount();
  vi.mocked(pickImage).mockResolvedValueOnce({ path: "picture.png", mime: "image/png", bytes: new Uint8Array(readFileSync("src-tauri/icons/32x32.png")) });
  await act(async () => button(host, "Image").click());
  expect(host.querySelectorAll(".page-preview .page-stack")).toHaveLength(2);
  expect(host.querySelectorAll(".page-preview .stamp")).toHaveLength(1);
  expect(host.querySelector(".page-preview .stamp img")?.getAttribute("alt")).toBe("picture.png");
});
