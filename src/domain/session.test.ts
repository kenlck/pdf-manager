import { describe, expect, it } from "vitest";
import { buildExportPlan } from "./exportPlan";
import { apply, createSession, pagesFromSource } from "./session";
import { asSourceId, type Source } from "./types";

function source(id: string, path: string, pageCount: number): Source {
  return { id: asSourceId(id), path, pageCount };
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
    expect([...session.selected].sort()).toEqual([0, 2]);
    const historyBefore = session.past.length;
    session = apply(session, { type: "move", from: 2, to: 0 });
    expect(session.past).toHaveLength(historyBefore + 1);
    expect(session.future).toEqual([]);
    expect([...session.selected].sort()).toEqual([0, 1]);
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
    expect([...session.selected].sort()).toEqual([0, 2]);
    session = apply(session, { type: "move", from: 2, to: 0 });
    expect([...session.selected].sort()).toEqual([0, 1]);
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
        { sourceId: asSourceId("a"), pageIndex: 1, rotation: 90 },
        { sourceId: asSourceId("a"), pageIndex: 0, rotation: 0 },
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
