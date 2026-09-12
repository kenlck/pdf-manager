import { describe, expect, it } from "vitest";
import {
  DEFAULT_STAMP_WIDTH,
  MIN_NORM_SIDE,
  defaultStampRect,
  displayNormRect,
  displayedRectToPdfDrawImage,
  rotateDisplayRect,
} from "./stampGeometry";

const CROP = { cropWidth: 200, cropHeight: 400 };

describe("displayNormRect", () => {
  it("clamps overflow toward the top-left", () => {
    const rect = displayNormRect({ x: 0.8, y: 0.7, w: 0.5, h: 0.5 });
    expect(rect).toEqual({
      x: 0.5,
      y: 0.5,
      w: 0.5,
      h: 0.5,
      __brand: "DisplayNormRect",
    });
  });

  it("forces sides up to MIN_NORM_SIDE then keeps the box on the page", () => {
    const rect = displayNormRect({ x: 0.99, y: 0.99, w: 0.01, h: 0.01 });
    expect(rect.w).toBe(MIN_NORM_SIDE);
    expect(rect.h).toBe(MIN_NORM_SIDE);
    expect(rect.x).toBeCloseTo(1 - MIN_NORM_SIDE, 10);
    expect(rect.y).toBeCloseTo(1 - MIN_NORM_SIDE, 10);
  });

  it("rejects non-finite values", () => {
    expect(() => displayNormRect({ x: Number.NaN, y: 0, w: 0.2, h: 0.2 })).toThrow(
      "DisplayNormRect requires finite x, y, w, h.",
    );
    expect(() =>
      displayNormRect({ x: 0, y: Number.POSITIVE_INFINITY, w: 0.2, h: 0.2 }),
    ).toThrow("DisplayNormRect requires finite x, y, w, h.");
  });
});

describe("rotateDisplayRect", () => {
  it("maps +90 as (x, y, w, h) → (1 - y - h, x, h, w)", () => {
    const rect = displayNormRect({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
    expect(rotateDisplayRect(rect, 90)).toEqual({
      x: 0.4,
      y: 0.1,
      w: 0.4,
      h: 0.3,
      __brand: "DisplayNormRect",
    });
  });

  it("returns identity after four +90 rotations", () => {
    const rect = displayNormRect({ x: 0.1, y: 0.2, w: 0.3, h: 0.15 });
    const once = rotateDisplayRect(rect, 90);
    const twice = rotateDisplayRect(once, 90);
    const thrice = rotateDisplayRect(twice, 90);
    const four = rotateDisplayRect(thrice, 90);
    expect(four.x).toBeCloseTo(0.1, 12);
    expect(four.y).toBeCloseTo(0.2, 12);
    expect(four.w).toBe(0.3);
    expect(four.h).toBe(0.15);
    expect(twice.x).toBeCloseTo(0.6, 12);
    expect(twice.y).toBeCloseTo(0.65, 12);
    expect(twice.w).toBe(0.3);
    expect(twice.h).toBe(0.15);
  });

  it("keeps a full-page rect full-page under any rotation", () => {
    const full = displayNormRect({ x: 0, y: 0, w: 1, h: 1 });
    expect(rotateDisplayRect(full, 90)).toEqual(full);
    expect(rotateDisplayRect(full, -90)).toEqual(full);
    expect(rotateDisplayRect(rotateDisplayRect(full, 90), 90)).toEqual(full);
  });
});

describe("defaultStampRect", () => {
  it("centers a 0.35-wide stamp using the image aspect", () => {
    const rect = defaultStampRect(2);
    expect(rect.w).toBe(DEFAULT_STAMP_WIDTH);
    expect(rect.h).toBe(DEFAULT_STAMP_WIDTH / 2);
    expect(rect.x).toBeCloseTo((1 - DEFAULT_STAMP_WIDTH) / 2, 10);
    expect(rect.y).toBeCloseTo((1 - rect.h) / 2, 10);
  });
});

describe("displayedRectToPdfDrawImage", () => {
  const rect = displayNormRect({ x: 0.1, y: 0.1, w: 0.2, h: 0.15 });

  it("gives a top-left stamp a large pdf y at rotation 0", () => {
    const topLeft = displayNormRect({ x: 0.1, y: 0.05, w: 0.2, h: 0.1 });
    const draw = displayedRectToPdfDrawImage(topLeft, { ...CROP, rotation: 0 });
    expect(draw.x).toBe(20);
    expect(draw.width).toBe(40);
    expect(draw.height).toBe(40);
    expect(draw.y).toBe(340);
    expect(draw.y).toBe(CROP.cropHeight - 20 - 40);
  });

  it("matches the 200×400 numeric table at 90, 180, and 270", () => {
    expect(displayedRectToPdfDrawImage(rect, { ...CROP, rotation: 90 })).toEqual({
      x: 50,
      y: 40,
      width: 80,
      height: 30,
      rotate: -90,
    });
    expect(displayedRectToPdfDrawImage(rect, { ...CROP, rotation: 180 })).toEqual({
      x: 180,
      y: 100,
      width: 40,
      height: 60,
      rotate: -180,
    });
    expect(displayedRectToPdfDrawImage(rect, { ...CROP, rotation: 270 })).toEqual({
      x: 150,
      y: 360,
      width: 80,
      height: 30,
      rotate: -270,
    });
  });

  it("sets rotate to the negation of session rotation", () => {
    for (const rotation of [0, 90, 180, 270] as const) {
      const draw = displayedRectToPdfDrawImage(rect, { ...CROP, rotation });
      expect(draw.rotate).toBe(-rotation);
    }
  });
});
