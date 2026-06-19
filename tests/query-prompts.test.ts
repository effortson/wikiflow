import { describe, expect, it } from "vitest";
import {
  DEFAULT_QUERY_SYSTEM_PROMPT,
  DEFAULT_QUERY_USER_PROMPT,
  resolveQueryPrompts,
  substituteQueryPrompt,
} from "../src/wiki/query-prompts";

describe("query prompts", () => {
  it("substitutes template variables", () => {
    const out = substituteQueryPrompt("Wiki {{wikiId}} — {{question}}", {
      wikiId: "demo",
      question: "hello",
    });
    expect(out).toBe("Wiki demo — hello");
  });

  it("resolves default prompts with language instruction", () => {
    const { system, user } = resolveQueryPrompts({
      wikiId: "国标",
      question: "节能措施？",
      context: "### page\n\nbody",
      language: "zh",
    });
    expect(system).toContain('wikiId "国标"');
    expect(system).toContain("请使用简体中文回答");
    expect(user).toContain("Question: 节能措施？");
    expect(user).toContain("### page");
  });

  it("uses custom prompts when provided", () => {
    const { system, user } = resolveQueryPrompts({
      wikiId: "demo",
      question: "q",
      context: "ctx",
      language: "en",
      systemPrompt: "SYS {{wikiId}}",
      userPrompt: "USR {{question}} / {{context}}",
    });
    expect(system).toBe("SYS demo");
    expect(user).toBe("USR q / ctx");
  });

  it("exports non-empty defaults", () => {
    expect(DEFAULT_QUERY_SYSTEM_PROMPT).toContain("{{wikiId}}");
    expect(DEFAULT_QUERY_USER_PROMPT).toContain("{{question}}");
  });
});
