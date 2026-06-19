import { describe, expect, it } from "vitest";
import {
  formatWikiQueryResults,
  parseMaxQuestions,
  parseQuestionsInput,
  stripLlmNoise,
} from "../src/workflow/shared/parse-questions";

describe("parseQuestionsInput", () => {
  it("splits newline-separated text and strips numbering", () => {
    const questions = parseQuestionsInput(
      "1. 泄漏检测方法\n2. 空压机变频改造\n- 余热回收方案",
    );
    expect(questions).toEqual([
      "泄漏检测方法",
      "空压机变频改造",
      "余热回收方案",
    ]);
  });

  it("parses JSON array strings", () => {
    expect(parseQuestionsInput('["a","b"]')).toEqual(["a", "b"]);
  });

  it("accepts string arrays", () => {
    expect(parseQuestionsInput(["q1", "q2"])).toEqual(["q1", "q2"]);
  });

  it("dedupes and caps by maxQuestions", () => {
    const questions = parseQuestionsInput("a\nA\nb\nc\nd\ne", 3);
    expect(questions).toEqual(["a", "b", "c"]);
  });

  it("unwraps llm output objects and strips thinking blocks", () => {
    const questions = parseQuestionsInput({
      text: `<think>The user is asking how to save energy</think>
空压机余热回收利用技术
压缩空气站智能控制系统`,
    });
    expect(questions).toEqual([
      "空压机余热回收利用技术",
      "压缩空气站智能控制系统",
    ]);
  });

  it("strips thinking wrappers from strings", () => {
    const text = stripLlmNoise("泄漏检测方法");
    expect(text).toBe("泄漏检测方法");
  });
});

describe("parseMaxQuestions", () => {
  it("falls back for invalid values", () => {
    expect(parseMaxQuestions(undefined)).toBe(5);
    expect(parseMaxQuestions("bad")).toBe(5);
    expect(parseMaxQuestions("0")).toBe(5);
  });

  it("parses positive integers", () => {
    expect(parseMaxQuestions("3")).toBe(3);
    expect(parseMaxQuestions(7)).toBe(7);
  });
});

describe("formatWikiQueryResults", () => {
  it("formats numbered sections", () => {
    const text = formatWikiQueryResults([
      { question: "Q1", answer: "A1" },
      { question: "Q2", answer: "A2" },
    ]);
    expect(text).toContain("### 1. Q1");
    expect(text).toContain("A1");
    expect(text).toContain("### 2. Q2");
  });
});
