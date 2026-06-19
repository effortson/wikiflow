import { describe, expect, it } from "vitest";
import { slugify, uniqueSlug } from "../src/shared/slug";

describe("slugify", () => {
  it("keeps latin letters and numbers", () => {
    expect(slugify("GB 19153")).toBe("gb-19153");
  });

  it("keeps CJK characters", () => {
    expect(slugify("机组容积流量")).toBe("机组容积流量");
    expect(slugify("国家市场监督管理总局")).toBe("国家市场监督管理总局");
  });

  it("replaces punctuation and whitespace with hyphens", () => {
    expect(slugify("  Hello, World!  ")).toBe("hello-world");
    expect(slugify("能效限定值及能效等级")).toBe("能效限定值及能效等级");
  });

  it("mixes latin and CJK", () => {
    expect(slugify("GB 19153 容积式空气压缩机")).toBe(
      "gb-19153-容积式空气压缩机",
    );
  });

  it("falls back to untitled for empty or symbol-only names", () => {
    expect(slugify("")).toBe("untitled");
    expect(slugify("   ")).toBe("untitled");
    expect(slugify("---")).toBe("untitled");
  });
});

describe("uniqueSlug", () => {
  it("appends numeric suffix when slug already exists", async () => {
    const taken = new Set(["机组容积流量"]);
    const slug = await uniqueSlug("机组容积流量", async (s) => taken.has(s));
    expect(slug).toBe("机组容积流量-2");
  });
});
