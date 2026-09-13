/** @vitest-environment jsdom */
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import App from "./App";
import { pickOpenDocuments } from "./shell/files";

vi.mock("./shell/files", async (importOriginal) => ({
  ...await importOriginal<typeof import("./shell/files")>(),
  pickOpenDocuments: vi.fn(),
}));

vi.mock("./pdf/render", () => ({ clearRenderCache: vi.fn() }));
vi.mock("./ui/usePageCanvas", () => ({ usePageCanvas: () => ({ current: null }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let cleanup = () => {};
afterEach(() => cleanup());

function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(createElement(App)));
  cleanup = () => { act(() => root.unmount()); host.remove(); };
  return host;
}
function transfer(files: File[] = []) {
  return { files, types: files.length ? ["Files"] : ["text/plain"], effectAllowed: "all", dropEffect: "none", setData: vi.fn() };
}
function send(target: Element, type: string, data: ReturnType<typeof transfer>) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: data });
  target.dispatchEvent(event);
  return event;
}
function pdf(name: string) {
  const bytes = readFileSync("fixtures/two-page.pdf");
  return { name, type: "application/pdf", arrayBuffer: async () => Uint8Array.from(bytes).buffer } as File;
}

it("opens dropped PDFs and appends subsequent drops over thumbnails", async () => {
  const host = mount();
  await act(async () => { send(host.querySelector(".app")!, "drop", transfer([pdf("first.pdf")])); });
  expect(host.querySelectorAll(".page-thumb")).toHaveLength(2);
  await act(async () => { send(host.querySelector(".page-thumb")!, "drop", transfer([pdf("second.pdf")])); });
  expect(Array.from(host.querySelectorAll(".page-thumb"), el => el.getAttribute("data-source"))).toEqual(["first.pdf", "first.pdf", "second.pdf", "second.pdf"]);
});

it("allows file drops and prevents navigation for unsupported files", async () => {
  const host = mount();
  const data = transfer([{ name: "notes.txt", type: "text/plain" } as File]);
  expect(send(host.querySelector(".app")!, "dragover", data).defaultPrevented).toBe(true);
  await act(async () => { expect(send(host.querySelector(".app")!, "drop", data).defaultPrevented).toBe(true); });
  expect(host.querySelectorAll(".page-thumb")).toHaveLength(0);
  expect(host.textContent).toContain("PDF");
});

it.each(["View", "Organize"])("reorders real thumbnails in %s without importing the internal drag", async (workspace) => {
  const host = mount();
  await act(async () => { send(host.querySelector(".app")!, "drop", transfer([pdf("first.pdf"), pdf("second.pdf")])); });
  act(() => { (Array.from(host.querySelectorAll("[role=tab]")).find(el => el.textContent === workspace) as HTMLButtonElement).click(); });
  const thumbs = host.querySelectorAll(".page-thumb");
  expect(thumbs).toHaveLength(4);
  const data = transfer();
  act(() => { send(thumbs[0], "dragstart", data); });
  act(() => { send(thumbs[3], "dragover", data); });
  act(() => { send(thumbs[3], "drop", data); });
  expect(Array.from(host.querySelectorAll(".page-thumb"), el => el.getAttribute("data-source"))).toEqual(["first.pdf", "second.pdf", "second.pdf", "first.pdf"]);
});

it("lets HTML drag events reach the desktop frontend", () => {
  const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
  expect(config.app.windows[0].dragDropEnabled).toBe(false);
});

it("reports read failures and accepts a later drop", async () => {
  const host = mount();
  const broken = { name: "broken.pdf", type: "application/pdf", arrayBuffer: async () => { throw new Error("File unavailable"); } } as unknown as File;
  await act(async () => { send(host.querySelector(".app")!, "drop", transfer([broken])); });
  expect(host.textContent).toContain("File unavailable");
  await act(async () => { send(host.querySelector(".app")!, "drop", transfer([pdf("valid.pdf")])); });
  expect(host.querySelectorAll(".page-thumb")).toHaveLength(2);
  expect(host.textContent).not.toContain("File unavailable");
});

it("ignores a second drop while the first is still loading", async () => {
  const host = mount();
  let resolve!: (bytes: ArrayBuffer) => void;
  const pending = { name: "pending.pdf", type: "application/pdf", arrayBuffer: () => new Promise<ArrayBuffer>(done => { resolve = done; }) } as File;
  act(() => {
    send(host.querySelector(".app")!, "drop", transfer([pending]));
    send(host.querySelector(".app")!, "drop", transfer([pdf("duplicate.pdf")]));
  });
  await act(async () => { resolve(await pdf("valid.pdf").arrayBuffer()); });
  expect(Array.from(host.querySelectorAll(".page-thumb"), el => el.getAttribute("data-source"))).toEqual(["pending.pdf", "pending.pdf"]);
});

function imageFile() {
  const bytes = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
  return { name: "photo.PNG", type: "", arrayBuffer: async () => bytes.buffer } as File;
}

it("drops images alongside PDFs in file order", async () => {
  const host = mount();
  await act(async () => { send(host.querySelector(".app")!, "drop", transfer([imageFile(), pdf("document.pdf"), imageFile()])); });
  expect(Array.from(host.querySelectorAll(".page-thumb"), el => el.getAttribute("data-source"))).toEqual(["photo.PNG", "document.pdf", "document.pdf", "photo.PNG"]);
});

it.each(["Open", "Insert", "Combine"])("imports an image through %s", async (action) => {
  const host = mount();
  const file = imageFile();
  vi.mocked(pickOpenDocuments).mockResolvedValueOnce([{ path: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }]);
  await act(async () => {
    (Array.from(host.querySelectorAll("button")).find(el => el.textContent === action) as HTMLButtonElement).click();
  });
  expect(host.querySelectorAll(".page-thumb")).toHaveLength(1);
  expect(host.querySelector(".page-thumb")?.getAttribute("data-source")).toBe("photo.PNG");
});
