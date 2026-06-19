import { describe, expect, it } from "vitest";
import {
  listWikiInstances,
  resolveWikiId,
} from "../src/wiki/instance-resolver";

const RAW = "raw";

describe("resolveWikiId", () => {
  it("resolves nested file to first-level wikiId", () => {
    expect(resolveWikiId("raw/legal/contracts/a.pdf", RAW)).toBe("legal");
    expect(resolveWikiId("raw/legal/a/b/c/report.pdf", RAW)).toBe("legal");
  });

  it("returns null for file directly under raw root", () => {
    expect(resolveWikiId("raw/foo.pdf", RAW)).toBeNull();
  });

  it("returns null for paths outside raw", () => {
    expect(resolveWikiId("wiki/legal/index.md", RAW)).toBeNull();
  });

  it("resolves folder path under wiki", () => {
    expect(resolveWikiId("raw/legal/contracts", RAW)).toBe("legal");
  });
});

describe("listWikiInstances", () => {
  it("enumerates only direct children of raw/", () => {
    const instances = listWikiInstances({
      rawFolder: "raw",
      sourceFolder: "source",
      wikiRoot: "wiki",
      schemaRoot: "schema",
      listDirectChildren: () => [
        "raw/legal",
        "raw/product-rd",
        "raw/legal/contracts",
      ],
      isFolder: (p) => p === "raw/legal" || p === "raw/product-rd",
    });

    expect(instances.map((w) => w.wikiId)).toEqual(["legal", "product-rd"]);
    expect(instances[0].rawRoot).toBe("raw/legal");
    expect(instances[0].sourceRoot).toBe("source/legal");
    expect(instances[0].wikiRoot).toBe("wiki/legal");
    expect(instances[0].schemaRoot).toBe("schema/legal");
  });
});
