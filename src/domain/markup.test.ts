import { expect, it } from "vitest";
import { apply, createSession, pagesFromSource } from "./session";
import { buildExportPlan } from "./exportPlan";
import { displayNormRect, displayedRectToPdfDrawImage, rotateDisplayRect, rotatedArtworkDraw } from "./stampGeometry";
import { asSourceId, asStampId, type MarkupContent, type Stamp } from "./types";

const content: MarkupContent = { kind: "text", text: "First", color: "#123456", fontSize: 24, width: 160, height: 40 };
const stamp: Stamp = { id: asStampId("text"), content, rect: displayNormRect({ x: 0.1, y: 0.2, w: 0.3, h: 0.1 }) };
function setup() {
  const source = { id: asSourceId("a"), path: "test.pdf", pageCount: 2 };
  return apply(apply(createSession(), { type: "open", sources: [source], pages: pagesFromSource(source) }), { type: "placeStamp", pageIndex: 0, stamp });
}

it("edits text as one undoable operation, preserving earlier text and export content", () => {
  let session = setup();
  const edited: Stamp = { ...stamp, content: { ...content, text: "Changed\n第二行" } };
  session = apply(session, { type: "editStamp", pageIndex: 0, stamp: edited });
  expect(session.pages[0].stamps[0].content).toEqual(edited.content);
  session = apply(session, { type: "undo" });
  expect(session.pages[0].stamps[0].content).toEqual(content);
  session = apply(session, { type: "redo" });
  const plan = buildExportPlan(session);
  if (!plan.ok) throw new Error("Missing plan");
  expect(plan.pages[0].stamps[0].content).toEqual(edited.content);
  expect(apply(session, { type: "editStamp", pageIndex: 0, stamp: edited })).toBe(session);
});

it("keeps artwork, selection, and orientation through resizing, page reorder, deletion, and undo", () => {
  let session = setup();
  session = apply(session, { type: "transformStamp", pageIndex: 0, stampId: stamp.id, rect: displayNormRect({ x: 0.3, y: 0.4, w: 0.4, h: 0.2 }) });
  session = apply(session, { type: "rotate", indices: [0], delta: 90 });
  session = apply(session, { type: "move", from: 0, to: 1 });
  expect(session.selection).toEqual({ kind: "stamp", pageIndex: 1, stampId: stamp.id });
  expect(session.pages[1].stamps[0]).toMatchObject({ content, rotation: 90 });
  session = apply(session, { type: "removeStamp", pageIndex: 1, stampId: stamp.id });
  expect(session.pages[1].stamps).toHaveLength(0);
  session = apply(session, { type: "undo" });
  expect(session.pages[1].stamps[0]).toMatchObject({ content, rotation: 90 });
});

it.each([0, 90, 180, 270] as const)("keeps an object's PDF placement unchanged when rotating its page by %s degrees", (rotation) => {
  let rect = stamp.rect;
  for (let i = 0; i < rotation / 90; i++) rect = rotateDisplayRect(rect, 90);
  const page = { cropWidth: 600, cropHeight: 800 };
  const initial = displayedRectToPdfDrawImage(stamp.rect, { ...page, rotation: 0 });
  const draw = rotatedArtworkDraw(displayedRectToPdfDrawImage(rect, { ...page, rotation }), rotation);
  expect(draw.x).toBeCloseTo(initial.x);
  expect(draw.y).toBeCloseTo(initial.y);
  expect(draw.width).toBeCloseTo(initial.width);
  expect(draw.height).toBeCloseTo(initial.height);
  expect(draw.rotate).toBe(0);
});
