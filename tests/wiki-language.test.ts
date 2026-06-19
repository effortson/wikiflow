import { describe, expect, it } from "vitest";
import {
  normalizeWikiLanguage,
  wikiLanguageAnalysisInstruction,
} from "@shared/wiki-language";

describe("wiki-language", () => {
  it("defaults unknown values to zh", () => {
    expect(normalizeWikiLanguage(undefined)).toBe("zh");
    expect(normalizeWikiLanguage("fr")).toBe("zh");
    expect(normalizeWikiLanguage("en")).toBe("en");
  });

  it("uses Chinese analysis instructions for zh", () => {
    expect(wikiLanguageAnalysisInstruction("zh")).toContain("简体中文");
  });

  it("uses English analysis instructions for en", () => {
    expect(wikiLanguageAnalysisInstruction("en")).toContain("English");
  });
});
