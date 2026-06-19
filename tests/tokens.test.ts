import { describe, expect, it } from "vitest";
import { estimateTokens } from "../src/shared/tokens";

describe("estimateTokens", () => {
  it("uses ceil(chars/4)", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    expect(estimateTokens("a".repeat(100))).toBe(25);
  });
});
