import type { WikiSchemaConfig } from "@shared/types/wiki-schema";
import {
  normalizeWikiLanguage,
  wikiLanguageAnalysisInstruction,
  wikiLanguageTableAnalysisInstruction,
  type WikiLanguage,
} from "@shared/wiki-language";

export function allEntityTags(schema: WikiSchemaConfig): string[] {
  return dedupeTags([...schema.entityTags, ...schema.customEntityTags]);
}

export function allConceptTags(schema: WikiSchemaConfig): string[] {
  return dedupeTags([...schema.conceptTags, ...schema.customConceptTags]);
}

export function normalizeEntityType(
  type: string | undefined,
  schema: WikiSchemaConfig,
): string {
  return normalizeTag(type, allEntityTags(schema), schema.entityTags[0] ?? "organization");
}

export function normalizeConceptType(
  type: string | undefined,
  schema: WikiSchemaConfig,
): string {
  return normalizeTag(type, allConceptTags(schema), schema.conceptTags[0] ?? "process");
}

export function buildAnalysisSystemPrompt(
  schema: WikiSchemaConfig,
  language: WikiLanguage,
): string {
  const entityTypes = allEntityTags(schema).join("|");
  const conceptTypes = allConceptTags(schema).join("|");

  return `You extract structured knowledge from documents for a personal wiki.
Respond with ONLY valid JSON matching this shape:
{
  "summary": "string",
  "keyPoints": ["string"],
  "entities": [{ "name": "string", "type": "${entityTypes}", "aliases": [], "summary": "string", "mentions": [{ "quote": "string", "chunkId": "string" }], "relatedEntities": [], "relatedConcepts": [] }],
  "concepts": [{ "name": "string", "type": "${conceptTypes}", "aliases": [], "summary": "string", "mentions": [{ "quote": "string", "chunkId": "string" }], "relatedConcepts": [], "relatedEntities": [] }],
  "contradictions": []
}
Entity types must be one of: ${entityTypes}.
Concept types must be one of: ${conceptTypes}.
The "type" field MUST use the exact tag strings above (same language as the schema).
${wikiLanguageAnalysisInstruction(normalizeWikiLanguage(language))}
${wikiLanguageTableAnalysisInstruction(normalizeWikiLanguage(language))}
Use chunk ids from the input when citing mentions.`;
}

function normalizeTag(
  type: string | undefined,
  allowed: string[],
  fallback: string,
): string {
  if (!type?.trim()) return fallback;
  const trimmed = type.trim();
  if (allowed.includes(trimmed)) return trimmed;
  const lower = trimmed.toLowerCase();
  const match = allowed.find((t) => t.toLowerCase() === lower);
  return match ?? fallback;
}

function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const key = tag.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}
