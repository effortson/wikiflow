import { describe, expect, it } from "vitest";
import {
  diagnoseLlmConfigIssue,
  normalizeApiKey,
} from "../src/shared/llm-api-key";

describe("normalizeApiKey", () => {
  it("trims whitespace and strips Bearer prefix", () => {
    expect(normalizeApiKey("  Bearer sk-test  ")).toBe("sk-test");
  });

  it("strips surrounding quotes", () => {
    expect(normalizeApiKey('"sk-test"')).toBe("sk-test");
    expect(normalizeApiKey("'sk-test'")).toBe("sk-test");
  });

  it("removes zero-width characters", () => {
    expect(normalizeApiKey("sk-\u200Btest")).toBe("sk-test");
  });
});

describe("diagnoseLlmConfigIssue", () => {
  it("flags MiniMax sk-cp- key against DeepSeek base URL", () => {
    const issue = diagnoseLlmConfigIssue(
      "sk-cp-example",
      "https://api.deepseek.com",
    );
    expect(issue).toMatch(/MiniMax/i);
    expect(issue).toMatch(/api\.minimax\.io/i);
  });

  it("flags sk-cp- key when base URL is not MiniMax", () => {
    const issue = diagnoseLlmConfigIssue(
      "sk-cp-example",
      "https://api.openai.com/v1",
    );
    expect(issue).toMatch(/MiniMax/i);
  });

  it("returns null for sk-cp- key with MiniMax base URL", () => {
    expect(
      diagnoseLlmConfigIssue("sk-cp-example", "https://api.minimax.io/v1"),
    ).toBeNull();
  });

  it("returns null for standard DeepSeek key on DeepSeek URL", () => {
    expect(
      diagnoseLlmConfigIssue("sk-abc123", "https://api.deepseek.com"),
    ).toBeNull();
  });
});
