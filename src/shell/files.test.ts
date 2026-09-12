import { describe, expect, it } from "vitest";
import { normalizeOpenResult } from "./files";

describe("open dialog payload", () => {
  it("normalizes a single path to string[]", () => {
    expect(normalizeOpenResult("/tmp/a.pdf")).toEqual(["/tmp/a.pdf"]);
  });

  it("keeps multi-select arrays", () => {
    expect(normalizeOpenResult(["/tmp/a.pdf", "/tmp/b.pdf"])).toEqual([
      "/tmp/a.pdf",
      "/tmp/b.pdf",
    ]);
  });

  it("keeps cancel as null", () => {
    expect(normalizeOpenResult(null)).toBeNull();
  });
});
