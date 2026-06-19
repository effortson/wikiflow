import type { WikiId } from "./wiki-instance";
import type { WikiLanguage } from "../wiki-language";

export type EntityResolutionMatchBy = "exact-name" | "alias";
export type EntityResolutionOnConflict = "merge-to-existing";

export interface EntityResolutionConfig {
  matchBy: EntityResolutionMatchBy[];
  onConflict: EntityResolutionOnConflict;
}

export interface WikiSchemaConfig {
  schemaVersion: 1;
  wikiId: WikiId;
  entityTags: string[];
  conceptTags: string[];
  customEntityTags: string[];
  customConceptTags: string[];
  entityResolution: EntityResolutionConfig;
}

const ENTITY_RESOLUTION: EntityResolutionConfig = {
  matchBy: ["exact-name", "alias"],
  onConflict: "merge-to-existing",
};

export const DEFAULT_WIKI_SCHEMA_EN: Omit<WikiSchemaConfig, "wikiId"> = {
  schemaVersion: 1,
  entityTags: [
    "person",
    "organization",
    "location",
    "product",
    "event",
  ],
  conceptTags: ["process", "policy", "metric", "technology"],
  customEntityTags: [],
  customConceptTags: [],
  entityResolution: ENTITY_RESOLUTION,
};

export const DEFAULT_WIKI_SCHEMA_ZH: Omit<WikiSchemaConfig, "wikiId"> = {
  schemaVersion: 1,
  entityTags: ["人物", "机构", "地点", "产品", "事件"],
  conceptTags: ["流程", "政策", "指标", "技术"],
  customEntityTags: [],
  customConceptTags: [],
  entityResolution: ENTITY_RESOLUTION,
};

/** Default schema for the configured wiki content language (zh by default). */
export const DEFAULT_WIKI_SCHEMA = DEFAULT_WIKI_SCHEMA_ZH;

export function defaultWikiSchema(
  language: WikiLanguage,
): Omit<WikiSchemaConfig, "wikiId"> {
  return language === "en" ? DEFAULT_WIKI_SCHEMA_EN : DEFAULT_WIKI_SCHEMA_ZH;
}
