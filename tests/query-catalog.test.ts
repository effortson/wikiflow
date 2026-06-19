import { describe, expect, it } from "vitest";
import {
  excerptFromBody,
  extractTitle,
  keywordRecall,
} from "../src/wiki/engine/query-catalog";
import type { QueryCatalog } from "@shared/types/query-catalog";

describe("query-catalog helpers", () => {
  it("extracts title from markdown heading", () => {
    expect(extractTitle("# Acme Corp\n\nBody", "wiki/legal/entities/acme.md")).toBe(
      "Acme Corp",
    );
  });

  it("keywordRecall ranks matching pages", () => {
    const catalog: QueryCatalog = {
      wikiId: "legal",
      builtAt: "2026-01-01",
      pages: [
        {
          path: "wiki/legal/entities/acme.md",
          type: "entity",
          title: "Acme Corp",
          aliases: ["ACME"],
          excerpt: "A technology company",
          updated: "2026-01-01",
          sources: [],
        },
        {
          path: "wiki/legal/concepts/revenue.md",
          type: "concept",
          title: "Revenue",
          aliases: [],
          excerpt: "Annual revenue metrics",
          updated: "2026-01-01",
          sources: [],
        },
      ],
    };

    const results = keywordRecall(catalog, "What is Acme revenue?", 5);
    expect(results[0]?.title).toBe("Acme Corp");
    expect(results.some((r) => r.title === "Revenue")).toBe(true);
  });

  it("excerptFromBody strips headings and wikilinks", () => {
    const excerpt = excerptFromBody(
      "# Title\n\nHello [[wiki/legal/entities/acme|Acme]] world.",
    );
    expect(excerpt).toContain("Hello");
    expect(excerpt).toContain("Acme");
    expect(excerpt).not.toContain("[[");
  });
});
