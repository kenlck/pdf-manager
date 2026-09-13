import { expect, it } from "vitest";
import { artworkSvg, DEFAULT_STYLE, drawnStamp } from "./artwork";

it("treats text as literal content, including multiline and non-Latin text", () => {
  const svg = artworkSvg({ kind: "text", text: '<script>& "hello"\n中文', fontSize: 20, color: "#123456", width: 300, height: 70 });
  expect(svg).not.toContain("<script>");
  expect(svg).toContain("&lt;script&gt;&amp; &quot;hello&quot;");
  expect(svg).toContain("中文</text>");
  expect(svg.match(/<text /g)).toHaveLength(2);
});

it.each(["rectangle", "ellipse", "line", "pencil"] as const)("bounds a reverse %s gesture on a portrait page", (tool) => {
  const stamp = drawnStamp(tool, [{ x: 650, y: 900 }, { x: 400, y: 700 }], 1100, DEFAULT_STYLE);
  expect(stamp.rect.x).toBeLessThan(400 / 800);
  expect(stamp.rect.y).toBeLessThan(700 / 1100);
  expect(stamp.rect.x + stamp.rect.w).toBeLessThanOrEqual(1);
  expect(stamp.rect.y + stamp.rect.h).toBeLessThanOrEqual(1);
  expect(stamp.content?.kind).toBe(tool);
  if (stamp.content && "points" in stamp.content) {
    const [a, b] = stamp.content.points;
    expect(a.x - b.x).toBe(250);
    expect(a.y - b.y).toBe(200);
  }
});

it("preserves a horizontal line's exact height and supports pencil dots", () => {
  const line = drawnStamp("line", [{ x: 0, y: 300 }, { x: 800, y: 300 }], 1000, DEFAULT_STYLE);
  if (!line.content || !("points" in line.content)) throw new Error("Missing line");
  expect(line.content.points[0].y).toBe(line.content.points[1].y);
  const dot = drawnStamp("pencil", [{ x: 100, y: 100 }], 1000, DEFAULT_STYLE);
  expect(artworkSvg(dot.content!)).toContain("<circle");
});

it("handles long freehand strokes without overflowing argument limits", () => {
  const points = Array.from({ length: 150000 }, (_, i) => ({ x: i % 800, y: i % 1000 }));
  const stamp = drawnStamp("pencil", points, 1000, DEFAULT_STYLE);
  expect(stamp.content && "points" in stamp.content && stamp.content.points.length).toBe(points.length);
});
