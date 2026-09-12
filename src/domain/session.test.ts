import { describe, expect, it } from "vitest";
import { buildExportPlan } from "./exportPlan";
import { apply, createSession, pagesFromSource } from "./session";
import { displayNormRect } from "./stampGeometry";
import {
  asSourceId,
  asStampId,
  selectedPageIndices,
  selectedStamp,
  type Source,
  type Stamp,
} from "./types";

function source(id: string, path: string, pageCount: number): Source {
  return { id: asSourceId(id), path, pageCount };
}

function stamp(id: string, rect: { x: number; y: number; w: number; h: number }): Stamp {
  return { id: asStampId(id), rect: displayNormRect(rect) };
}

describe("session reducer", () => {
  it("opens a source and builds pages", () => {
    const a = source("a", "/tmp/a.pdf", 3);
    const session = apply(createSession(), {
      type: "open",
      sources: [a],
      pages: pagesFromSource(a),
    });
    expect(session.pages).toHaveLength(3);
    expect(session.focused).toBe(0);
    expect(session.sources.get(asSourceId("a"))?.pageCount).toBe(3);
  });

  it("moves the last page to the first slot", () => {
    const a = source("a", "/tmp/a.pdf", 3);
    let session = apply(createSession(), {
      type: "open",
      sources: [a],
      pages: pagesFromSource(a),
    });
    session = apply(session, { type: "move", from: 2, to: 0 });
    expect(session.pages.map((p) => p.pageIndex)).toEqual([2, 0, 1]);
  });

  it("combines two files in order", () => {
    const a = source("a", "/tmp/a.pdf", 3);
    const b = source("b", "/tmp/b.pdf", 2);
    let session = apply(createSession(), {
      type: "open",
      sources: [a],
      pages: pagesFromSource(a),
    });
    session = apply(session, {
      type: "combine",
      sources: [b],
      pages: pagesFromSource(b),
    });
    expect(session.pages).toHaveLength(5);
    expect(session.pages.map((p) => `${p.sourceId}:${p.pageIndex}`)).toEqual([
      "a:0",
      "a:1",
      "a:2",
      "b:0",
      "b:1",
    ]);
  });

  it("inserts after the selection", () => {
    const a = source("a", "/tmp/a.pdf", 2);
    const b = source("b", "/tmp/b.pdf", 1);
    let session = apply(createSession(), {
      type: "open",
      sources: [a],
      pages: pagesFromSource(a),
    });
    session = apply(session, {
      type: "select",
      indices: [0],
      mode: "replace",
    });
    session = apply(session, {
      type: "insert",
      sources: [b],
      pages: pagesFromSource(b),
      afterIndex: 0,
    });
    expect(session.pages.map((p) => `${p.sourceId}:${p.pageIndex}`)).toEqual([
      "a:0",
      "b:0",
      "a:1",
    ]);
  });

  it("deletes and undoes", () => {
    const a = source("a", "/tmp/a.pdf", 3);
    let session = apply(createSession(), {
      type: "open",
      sources: [a],
      pages: pagesFromSource(a),
    });
    session = apply(session, { type: "delete", indices: [1] });
    expect(session.pages.map((p) => p.pageIndex)).toEqual([0, 2]);
    session = apply(session, { type: "undo" });
    expect(session.pages.map((p) => p.pageIndex)).toEqual([0, 1, 2]);
  });

  it("leaves past and future unchanged when move from equals to", () => {
    const a = source("a", "/tmp/a.pdf", 3);
    let session = apply(createSession(), {
      type: "open",
      sources: [a],
      pages: pagesFromSource(a),
    });
    const before = session;
    session = apply(session, { type: "move", from: 1, to: 1 });
    expect(session).toBe(before);
    expect(session.past).toBe(before.past);
    expect(session.future).toBe(before.future);
  });

  it("leaves history unchanged when move is out of range", () => {
    const a = source("a", "/tmp/a.pdf", 3);
    let session = apply(createSession(), {
      type: "open",
      sources: [a],
      pages: pagesFromSource(a),
    });
    const before = session;
    session = apply(session, { type: "move", from: 0, to: 9 });
    expect(session).toBe(before);
    expect(session.past).toBe(before.past);
    expect(session.future).toBe(before.future);
  });

  it("records exactly one undo step for a real move and remaps selection", () => {
    const a = source("a", "/tmp/a.pdf", 4);
    let session = apply(createSession(), {
      type: "open",
      sources: [a],
      pages: pagesFromSource(a),
    });
    session = apply(session, {
      type: "select",
      indices: [1, 3],
      mode: "replace",
    });
    session = apply(session, { type: "delete", indices: [0] });
    expect([...selectedPageIndices(session.selection)].sort()).toEqual([0, 2]);
    const historyBefore = session.past.length;
    session = apply(session, { type: "move", from: 2, to: 0 });
    expect(session.past).toHaveLength(historyBefore + 1);
    expect(session.future).toEqual([]);
    expect([...selectedPageIndices(session.selection)].sort()).toEqual([0, 1]);
    expect(session.pages.map((p) => p.pageIndex)).toEqual([3, 1, 2]);
  });

  it("remaps selection after delete and move", () => {
    const a = source("a", "/tmp/a.pdf", 4);
    let session = apply(createSession(), {
      type: "open",
      sources: [a],
      pages: pagesFromSource(a),
    });
    session = apply(session, {
      type: "select",
      indices: [1, 3],
      mode: "replace",
    });
    session = apply(session, { type: "delete", indices: [0] });
    expect([...selectedPageIndices(session.selection)].sort()).toEqual([0, 2]);
    session = apply(session, { type: "move", from: 2, to: 0 });
    expect([...selectedPageIndices(session.selection)].sort()).toEqual([0, 1]);
  });

  it("refuses an empty export plan", () => {
    expect(buildExportPlan(createSession())).toEqual({
      ok: false,
      reason: "empty",
    });
  });

  it("builds an export plan in board order", () => {
    const a = source("a", "/tmp/a.pdf", 2);
    let session = apply(createSession(), {
      type: "open",
      sources: [a],
      pages: pagesFromSource(a),
    });
    session = apply(session, { type: "move", from: 1, to: 0 });
    session = apply(session, {
      type: "rotate",
      indices: [0],
      delta: 90,
    });
    const plan = buildExportPlan(session);
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.pages).toEqual([
        {
          sourceId: asSourceId("a"),
          pageIndex: 1,
          rotation: 90,
          stamps: [],
        },
        {
          sourceId: asSourceId("a"),
          pageIndex: 0,
          rotation: 0,
          stamps: [],
        },
      ]);
    }
  });

  it("applies 1000 moves on a 50-page session under 50ms", () => {
    const a = source("a", "/tmp/a.pdf", 50);
    let session = apply(createSession(), {
      type: "open",
      sources: [a],
      pages: pagesFromSource(a),
    });
    const start = performance.now();
    for (let i = 0; i < 1000; i += 1) {
      session = apply(session, {
        type: "move",
        from: i % 50,
        to: (i * 7) % 50,
      });
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
    expect(session.pages).toHaveLength(50);
  });
});

describe("session stamps", () => {
  const rect = { x: 0.1, y: 0.2, w: 0.3, h: 0.15 };

  it("yields empty stamps from pagesFromSource", () => {
    const a = source("a", "/tmp/a.pdf", 2);
    expect(pagesFromSource(a).map((page) => page.stamps)).toEqual([[], []]);
  });

  it("places a stamp, undoes, and redoes without aliasing the stamps array", () => {
    const a = source("a", "/tmp/a.pdf", 1);
    let session = apply(createSession(), {
      type: "open",
      sources: [a],
      pages: pagesFromSource(a),
    });
    session = apply(session, {
      type: "placeStamp",
      pageIndex: 0,
      stamp: stamp("s1", rect),
    });
    expect(session.pages[0].stamps).toHaveLength(1);
    expect(selectedStamp(session.selection)).toEqual({
      pageIndex: 0,
      stampId: asStampId("s1"),
    });
    session = apply(session, { type: "undo" });
    expect(session.pages[0].stamps).toEqual([]);
    session.pages[0].stamps.push(stamp("ghost", rect));
    session = apply(session, { type: "redo" });
    expect(session.pages[0].stamps.map((item) => item.id)).toEqual([asStampId("s1")]);
  });

  it("keeps different stamps on two slots that share a source page", () => {
    const a = source("a", "/tmp/a.pdf", 1);
    let session = apply(createSession(), {
      type: "open",
      sources: [a],
      pages: pagesFromSource(a),
    });
    session = apply(session, {
      type: "insert",
      sources: [a],
      pages: pagesFromSource(a),
      afterIndex: 0,
    });
    session = apply(session, {
      type: "placeStamp",
      pageIndex: 0,
      stamp: stamp("left", rect),
    });
    session = apply(session, {
      type: "placeStamp",
      pageIndex: 1,
      stamp: stamp("right", { x: 0.5, y: 0.5, w: 0.2, h: 0.2 }),
    });
    session = apply(session, { type: "move", from: 1, to: 0 });
    expect(session.pages[0].stamps.map((item) => item.id)).toEqual([asStampId("right")]);
    expect(session.pages[1].stamps.map((item) => item.id)).toEqual([asStampId("left")]);
  });

  it("drops stamps with a deleted slot and does not copy them on insert", () => {
    const a = source("a", "/tmp/a.pdf", 2);
    const b = source("b", "/tmp/b.pdf", 1);
    let session = apply(createSession(), {
      type: "open",
      sources: [a],
      pages: pagesFromSource(a),
    });
    session = apply(session, {
      type: "placeStamp",
      pageIndex: 0,
      stamp: stamp("keep", rect),
    });
    session = apply(session, { type: "delete", indices: [0] });
    expect(session.pages).toHaveLength(1);
    expect(session.pages[0].stamps).toEqual([]);
    session = apply(session, {
      type: "placeStamp",
      pageIndex: 0,
      stamp: stamp("on-remaining", rect),
    });
    session = apply(session, {
      type: "insert",
      sources: [b],
      pages: pagesFromSource(b),
      afterIndex: 0,
    });
    expect(session.pages[0].stamps.map((item) => item.id)).toEqual([
      asStampId("on-remaining"),
    ]);
    expect(session.pages[1].stamps).toEqual([]);
  });

  it("remaps stamp rects on rotate and restores rotation and rects on undo", () => {
    const a = source("a", "/tmp/a.pdf", 1);
    const placed = stamp("s1", rect);
    let session = apply(createSession(), {
      type: "open",
      sources: [a],
      pages: pagesFromSource(a),
    });
    session = apply(session, { type: "placeStamp", pageIndex: 0, stamp: placed });
    session = apply(session, { type: "rotate", indices: [0], delta: 90 });
    expect(session.pages[0].rotation).toBe(90);
    expect(session.pages[0].stamps[0].rect).toEqual(
      displayNormRect({ x: 1 - 0.2 - 0.15, y: 0.1, w: 0.15, h: 0.3 }),
    );
    session = apply(session, { type: "undo" });
    expect(session.pages[0].rotation).toBe(0);
    expect(session.pages[0].stamps[0].rect).toEqual(placed.rect);
  });

  it("does not grow past when transformStamp uses an equal rect", () => {
    const a = source("a", "/tmp/a.pdf", 1);
    const placed = stamp("s1", rect);
    let session = apply(createSession(), {
      type: "open",
      sources: [a],
      pages: pagesFromSource(a),
    });
    session = apply(session, { type: "placeStamp", pageIndex: 0, stamp: placed });
    const pastAfterPlace = session.past.length;
    session = apply(session, {
      type: "transformStamp",
      pageIndex: 0,
      stampId: placed.id,
      rect: placed.rect,
    });
    expect(session.past).toHaveLength(pastAfterPlace);
    expect(session.pages[0].stamps[0].rect).toEqual(placed.rect);
  });

  it("drops stamp selection when selecting pages", () => {
    const a = source("a", "/tmp/a.pdf", 2);
    let session = apply(createSession(), {
      type: "open",
      sources: [a],
      pages: pagesFromSource(a),
    });
    session = apply(session, {
      type: "placeStamp",
      pageIndex: 0,
      stamp: stamp("s1", rect),
    });
    session = apply(session, {
      type: "selectStamp",
      pageIndex: 0,
      stampId: asStampId("s1"),
    });
    expect(selectedStamp(session.selection)?.stampId).toBe(asStampId("s1"));
    session = apply(session, {
      type: "select",
      indices: [1],
      mode: "replace",
    });
    expect(selectedStamp(session.selection)).toBeNull();
    expect([...selectedPageIndices(session.selection)]).toEqual([1]);
  });

  it("is a no-op without history when removeStamp misses", () => {
    const a = source("a", "/tmp/a.pdf", 1);
    let session = apply(createSession(), {
      type: "open",
      sources: [a],
      pages: pagesFromSource(a),
    });
    session = apply(session, {
      type: "placeStamp",
      pageIndex: 0,
      stamp: stamp("s1", rect),
    });
    const pastAfterPlace = session.past.length;
    session = apply(session, {
      type: "removeStamp",
      pageIndex: 0,
      stampId: asStampId("missing"),
    });
    expect(session.past).toHaveLength(pastAfterPlace);
    expect(session.pages[0].stamps).toHaveLength(1);
  });

  it("copies stamps onto the export plan", () => {
    const a = source("a", "/tmp/a.pdf", 1);
    const placed = stamp("s1", rect);
    let session = apply(createSession(), {
      type: "open",
      sources: [a],
      pages: pagesFromSource(a),
    });
    session = apply(session, { type: "placeStamp", pageIndex: 0, stamp: placed });
    const plan = buildExportPlan(session);
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.pages[0].stamps).toEqual([{ stampId: placed.id, rect: placed.rect }]);
    }
  });
});
