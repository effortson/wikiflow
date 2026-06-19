import { describe, expect, it } from "vitest";
import {
  DEFAULT_WIKI_SCHEMA_ZH,
  defaultWikiSchema,
} from "../src/shared/types/wiki-schema";
import { normalizeGeneratedSchema } from "../src/wiki/schema/schema-generator";
import {
  allConceptTags,
  allEntityTags,
  buildAnalysisSystemPrompt,
  normalizeConceptType,
  normalizeEntityType,
} from "../src/wiki/schema/schema-vocabulary";

describe("schema-vocabulary", () => {
  const schema = {
    ...DEFAULT_WIKI_SCHEMA_ZH,
    wikiId: "legal",
    customEntityTags: ["标准"],
    customConceptTags: ["规范"],
  };

  it("merges custom tags into allowed vocabulary", () => {
    expect(allEntityTags(schema)).toContain("标准");
    expect(allConceptTags(schema)).toContain("规范");
  });

  it("builds LLM prompt with schema tags", () => {
    const prompt = buildAnalysisSystemPrompt(schema, "zh");
    expect(prompt).toContain("标准");
    expect(prompt).toContain("规范");
    expect(prompt).toContain("人物|机构");
  });

  it("normalizes unknown types to schema fallback", () => {
    expect(normalizeEntityType("标准", schema)).toBe("标准");
    expect(normalizeConceptType("unknown", schema)).toBe("流程");
  });
});

describe("defaultWikiSchema", () => {
  it("returns Chinese tags for zh", () => {
    expect(defaultWikiSchema("zh").entityTags).toContain("机构");
    expect(defaultWikiSchema("zh").conceptTags).toContain("指标");
  });

  it("returns English tags for en", () => {
    expect(defaultWikiSchema("en").entityTags).toContain("organization");
    expect(defaultWikiSchema("en").conceptTags).toContain("metric");
  });
});

describe("normalizeGeneratedSchema", () => {
  it("falls back to Chinese defaults when LLM returns empty lists", () => {
    const config = normalizeGeneratedSchema(
      "国标",
      { entityTags: [], conceptTags: [] },
      "zh",
    );
    expect(config.entityTags).toEqual(DEFAULT_WIKI_SCHEMA_ZH.entityTags);
    expect(config.conceptTags).toEqual(DEFAULT_WIKI_SCHEMA_ZH.conceptTags);
    expect(config.wikiId).toBe("国标");
  });

  it("keeps domain-specific custom tags", () => {
    const config = normalizeGeneratedSchema(
      "国标",
      {
        entityTags: ["机构", "人物"],
        conceptTags: ["指标", "政策"],
        customEntityTags: ["标准机构"],
        customConceptTags: ["试验方法"],
      },
      "zh",
    );
    expect(config.customEntityTags).toEqual(["标准机构"]);
    expect(config.customConceptTags).toEqual(["试验方法"]);
  });
});
