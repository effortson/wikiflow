import { describe, expect, it } from "vitest";
import { parseMarkdown } from "../src/shared/frontmatter";
import { extractTitle } from "../src/wiki/engine/query-catalog";

describe("lint fixtures", () => {
  it("detects duplicate entity titles from page bodies", () => {
    const pageA = parseMarkdown(`---
type: entity
wikiId: legal
aliases: [ACME]
tags: [organization]
---
# Acme Corp
`);
    const pageB = parseMarkdown(`---
type: entity
wikiId: legal
aliases: []
tags: [organization]
---
# acme corp
`);

    const titleA = extractTitle(pageA.body, "wiki/legal/entities/acme.md").toLowerCase();
    const titleB = extractTitle(pageB.body, "wiki/legal/entities/acme-2.md").toLowerCase();
    expect(titleA).toBe(titleB);
  });

  it("parses wikilinks for dead link checks", () => {
    const body = "See [[wiki/legal/entities/missing]] for details.";
    const linkRe = /\[\[([^\]|#]+)/g;
    const match = linkRe.exec(body);
    expect(match?.[1]).toBe("wiki/legal/entities/missing");
  });
});
