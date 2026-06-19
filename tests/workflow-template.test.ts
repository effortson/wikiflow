import { describe, expect, it } from "vitest";
import { resolveTemplate, TemplateResolutionError } from "../src/workflow/runtime/template";

describe("workflow template", () => {
  it("resolves whole-string variable reference", () => {
    const vars = new Map<string, unknown>([["name", "Acme"]]);
    expect(resolveTemplate("{{name}}", vars)).toBe("Acme");
  });

  it("resolves nested path", () => {
    const vars = new Map<string, unknown>([
      ["report", { status: "completed" }],
    ]);
    expect(resolveTemplate("{{report.status}}", vars)).toBe("completed");
  });

  it("resolves node-scoped output reference", () => {
    const vars = new Map<string, unknown>([
      ["pick", { path: "raw/demo/a.pdf", wikiId: "demo" }],
    ]);
    expect(resolveTemplate("{{pick.path}}", vars)).toBe("raw/demo/a.pdf");
  });

  it("resolves full node output bag via .output", () => {
    const bag = { answer: "hello", wikiId: "demo" };
    const vars = new Map<string, unknown>([["wiki-query-3", bag]]);
    expect(resolveTemplate("{{wiki-query-3.output}}", vars)).toEqual(bag);
  });

  it("resolves single field from node output bag", () => {
    const vars = new Map<string, unknown>([
      ["wiki-query-3", { answer: "hello", wikiId: "demo" }],
    ]);
    expect(resolveTemplate("{{wiki-query-3.answer}}", vars)).toBe("hello");
    expect(resolveTemplate("{{wiki-query-3.wikiId}}", vars)).toBe("demo");
  });

  it("resolves nested fields under node output bag", () => {
    const vars = new Map<string, unknown>([
      ["sub", { ingestReport: { status: "completed" } }],
    ]);
    expect(resolveTemplate("{{sub.ingestReport.status}}", vars)).toBe(
      "completed",
    );
  });

  it("interpolates templates embedded in text", () => {
    const vars = new Map<string, unknown>([
      ["input", { text: "如何降低压缩空气站能耗" }],
    ]);
    expect(
      resolveTemplate("用户问题：{{input.text}}", vars),
    ).toBe("用户问题：如何降低压缩空气站能耗");
  });

  it("keeps whole-string object references as objects", () => {
    const bag = { answer: "hello" };
    const vars = new Map<string, unknown>([["batch", bag]]);
    expect(resolveTemplate("{{batch}}", vars)).toEqual(bag);
  });
});
