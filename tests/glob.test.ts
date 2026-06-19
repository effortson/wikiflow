import { describe, expect, it } from "vitest";
import { matchGlob } from "../src/shared/glob";

describe("matchGlob", () => {
  it("matches all files with **/*", () => {
    expect(matchGlob("notes.txt", "**/*")).toBe(true);
    expect(matchGlob("a/b/c.pdf", "**/*")).toBe(true);
  });

  it("matches extension patterns", () => {
    expect(matchGlob("docs/report.pdf", "*.pdf")).toBe(false);
    expect(matchGlob("report.pdf", "*.pdf")).toBe(true);
    expect(matchGlob("a/report.pdf", "**/*.pdf")).toBe(true);
  });
});
