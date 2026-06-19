import { describe, expect, it } from "vitest";
import { queryWikiAnswer } from "../src/workflow/shared/query-wiki";

describe("queryWikiAnswer", () => {
  it("throws when wiki query returns only an error chunk", async () => {
    const wiki = {
      query: async function* () {
        yield { kind: "error" as const, message: "No wiki pages found" };
      },
    };

    await expect(
      queryWikiAnswer(wiki as never, "demo", "test", new AbortController().signal),
    ).rejects.toThrow("No wiki pages found");
  });

  it("prefers done answer over prior text chunks", async () => {
    const wiki = {
      query: async function* () {
        yield { kind: "text" as const, delta: "partial" };
        yield { kind: "done" as const, answer: "final", citedPaths: [] };
      },
    };

    await expect(
      queryWikiAnswer(wiki as never, "demo", "test", new AbortController().signal),
    ).resolves.toBe("final");
  });
});
