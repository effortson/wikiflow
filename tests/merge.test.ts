import { describe, expect, it } from "vitest";
import { mergeWikiPage } from "../src/wiki/engine/merge";
import { todayIsoDate, stringifyMarkdown } from "../src/shared/frontmatter";

const baseFm = {
  type: "entity",
  wikiId: "legal",
  created: todayIsoDate(),
  updated: todayIsoDate(),
  sources: ["raw/legal/doc.txt"],
  tags: [],
  reviewed: false,
  aliases: [],
};

describe("mergeWikiPage", () => {
  it("does not overwrite body when reviewed is true", () => {
    const existing = stringifyMarkdown(
      { ...baseFm, reviewed: true },
      "\nUser edited body.\n",
    );
    const result = mergeWikiPage({
      existingContent: existing,
      incomingFrontmatter: { ...baseFm, reviewed: true },
      incomingBody: "\nLLM generated body.\n",
      incomingMentionsBlock: "",
      incomingSummary: "New summary",
      mergePolicy: "overwrite",
    });
    expect(result.content).toContain("User edited body.");
    expect(result.content).not.toContain("LLM generated body.");
    expect(result.skippedBody).toBe(true);
  });

  it("unions sources on merge", () => {
    const existing = stringifyMarkdown(
      { ...baseFm, sources: ["raw/legal/a.txt"] },
      "\n",
    );
    const result = mergeWikiPage({
      existingContent: existing,
      incomingFrontmatter: { ...baseFm, sources: ["raw/legal/b.txt"] },
      incomingBody: "",
      incomingMentionsBlock: "",
      incomingSummary: "",
      mergePolicy: "merge",
    });
    expect(result.content).toContain("raw/legal/a.txt");
    expect(result.content).toContain("raw/legal/b.txt");
  });

  it("skips body rewrite with mergePolicy skip", () => {
    const existing = stringifyMarkdown(baseFm, "\nOriginal.\n");
    const result = mergeWikiPage({
      existingContent: existing,
      incomingFrontmatter: baseFm,
      incomingBody: "\nReplacement.\n",
      incomingMentionsBlock: "",
      incomingSummary: "",
      mergePolicy: "skip",
    });
    expect(result.content).toContain("Original.");
    expect(result.content).not.toContain("Replacement.");
  });
});
