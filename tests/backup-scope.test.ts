import { describe, expect, it } from "vitest";
import { isInScope } from "../src/core/backup/scope";

describe("backup scope", () => {
  const paths = {
    rawFolder: "raw",
    sourceFolder: "source",
    wikiRoot: "wiki",
    schemaRoot: "schema",
    workflowsFolder: "workflows",
  };

  it("includes plugin paths in wikiflow scope", () => {
    expect(
      isInScope("wiki/legal/foo.md", {
        scope: "wikiflow",
        includeExtractCache: false,
        excludePatterns: [],
        paths,
      }),
    ).toBe(true);
  });

  it("excludes extract cache unless enabled", () => {
    expect(
      isInScope(".wikiflow/extracts/abc/extract.json", {
        scope: "wikiflow",
        includeExtractCache: false,
        excludePatterns: [],
        paths,
      }),
    ).toBe(false);

    expect(
      isInScope(".wikiflow/extracts/abc/extract.json", {
        scope: "wikiflow",
        includeExtractCache: true,
        excludePatterns: [],
        paths,
      }),
    ).toBe(true);
  });

  it("excludes workspace.json by default patterns via list filter", () => {
    const excluded = isInScope("notes/daily.md", {
      scope: "wikiflow",
      includeExtractCache: false,
      excludePatterns: [],
      paths,
    });
    expect(excluded).toBe(false);
  });
});
