import { describe, expect, it } from "vitest";
import { sanitizeLlmMarkdown } from "../src/shared/sanitize-markdown";
import { stripLlmNoise } from "../src/shared/strip-llm-noise";

describe("stripLlmNoise", () => {
  it("removes thinking blocks from answers", () => {
    const raw = `<think>分析用户问题</think>
## 节能建议

1. 检查泄漏`;
    expect(stripLlmNoise(raw)).toBe(`## 节能建议

1. 检查泄漏`);
  });
});

describe("sanitizeLlmMarkdown", () => {
  it("strips thinking before rendering markdown", () => {
    const raw = `<think>draft</think>
**结论**：可以改造变频器。`;
    expect(sanitizeLlmMarkdown(raw)).toBe("**结论**：可以改造变频器。");
  });
});
