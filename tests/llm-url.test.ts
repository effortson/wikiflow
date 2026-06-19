import { describe, expect, it } from "vitest";
import { resolveChatCompletionsUrl } from "../src/shared/llm-url";

describe("resolveChatCompletionsUrl", () => {
  it("appends chat/completions to OpenAI /v1 base", () => {
    expect(resolveChatCompletionsUrl("https://api.openai.com/v1")).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
  });

  it("adds /v1 when base URL has no path", () => {
    expect(resolveChatCompletionsUrl("https://api.openai.com")).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
  });

  it("uses DeepSeek path without /v1", () => {
    expect(resolveChatCompletionsUrl("https://api.deepseek.com")).toBe(
      "https://api.deepseek.com/chat/completions",
    );
    expect(resolveChatCompletionsUrl("https://api.deepseek.com/")).toBe(
      "https://api.deepseek.com/chat/completions",
    );
  });

  it("normalizes mistaken DeepSeek /v1 suffix", () => {
    expect(resolveChatCompletionsUrl("https://api.deepseek.com/v1")).toBe(
      "https://api.deepseek.com/chat/completions",
    );
  });

  it("preserves custom path prefixes that end with /v1", () => {
    expect(resolveChatCompletionsUrl("https://openrouter.ai/api/v1")).toBe(
      "https://openrouter.ai/api/v1/chat/completions",
    );
  });
});
