import { describe, expect, it } from "vitest";
import { sourcePathForRaw } from "../src/wiki/source/source-paths";
import {
  buildSourceMarkdown,
  parseEnterpriseSource,
} from "../src/wiki/source/source-markdown";

describe("source-paths", () => {
  it("maps raw paths to parallel source markdown paths", () => {
    expect(
      sourcePathForRaw(
        "raw/国标/GB+19153-2019-content.pdf",
        "raw/国标",
        "source/国标",
      ),
    ).toBe("source/国标/GB+19153-2019-content.md");
  });
});

describe("source-markdown", () => {
  it("round-trips enterprise source frontmatter", () => {
    const md = buildSourceMarkdown(
      {
        enterpriseflowSource: true,
        wikiId: "legal",
        rawPath: "raw/legal/report.pdf",
        rawContentHash: "abc123",
        convertedAt: "2026-06-18T00:00:00.000Z",
        extractorId: "pdf-text",
        extractorVersion: "1.1.0",
      },
      "| A | B |\n|---|---|\n| 1 | 2 |",
    );

    const parsed = parseEnterpriseSource(md);
    expect(parsed.meta?.rawPath).toBe("raw/legal/report.pdf");
    expect(parsed.meta?.rawContentHash).toBe("abc123");
    expect(parsed.body).toContain("| A | B |");
  });
});
