import type {
  ConceptInfo,
  EntityInfo,
  Mention,
  SourceAnalysis,
} from "@shared/types/wiki";
import type { WikiSchemaConfig } from "@shared/types/wiki-schema";
import type { NormalizedDocument } from "@shared/types/normalized-document";
import { parseLlmJson } from "@shared/parse-llm-json";
import {
  normalizeWikiLanguage,
  type WikiLanguage,
} from "@shared/wiki-language";
import type { LLMService } from "../../core/llm/llm-service";
import type { Logger } from "../../core/log/logger";
import {
  buildAnalysisSystemPrompt,
  normalizeConceptType,
  normalizeEntityType,
} from "../schema/schema-vocabulary";

export interface SourceAnalyzer {
  analyze(
    document: NormalizedDocument,
    schema: WikiSchemaConfig,
  ): Promise<SourceAnalysis>;
}

const JSON_RETRY_HINT =
  "Your previous reply was not valid JSON. Return ONLY one JSON object. Use double-quoted property names, no trailing commas, no comments, no markdown fences.";

export class LlmSourceAnalyzer implements SourceAnalyzer {
  constructor(
    private llm: LLMService,
    private logger: Logger,
    private getLanguage: () => WikiLanguage,
  ) {}

  async analyze(
    document: NormalizedDocument,
    schema: WikiSchemaConfig,
  ): Promise<SourceAnalysis> {
    const language = normalizeWikiLanguage(this.getLanguage());
    const chunkText = document.chunks
      .map((c) => `[${c.id}] ${c.text}`)
      .join("\n\n");

    const system = `${buildAnalysisSystemPrompt(schema, language)}
Return ONLY one JSON object. No markdown fences, comments, or trailing commas.`;

    const user = `Title: ${document.title}
Source: ${document.sourceId}

Content:
${chunkText.slice(0, 120_000)}`;

    const messages = [
      { role: "system" as const, content: system },
      { role: "user" as const, content: user },
    ];

    let raw = await this.llm.chat({
      messages,
      jsonMode: true,
      temperature: 0.1,
    });

    try {
      return parseAnalysisJson(raw, document, schema);
    } catch (firstErr) {
      this.logger.warn("LLM analysis JSON parse failed, retrying", {
        sourceId: document.sourceId,
        error:
          firstErr instanceof Error ? firstErr.message : String(firstErr),
      });

      raw = await this.llm.chat({
        messages: [
          ...messages,
          { role: "assistant", content: raw },
          { role: "user", content: JSON_RETRY_HINT },
        ],
        jsonMode: true,
        temperature: 0,
      });

      return parseAnalysisJson(raw, document, schema);
    }
  }
}

function parseAnalysisJson(
  raw: string,
  document: NormalizedDocument,
  schema: WikiSchemaConfig,
): SourceAnalysis {
  try {
    const data = parseLlmJson<Partial<SourceAnalysis>>(raw);
    return normalizeAnalysis(data, document, schema);
  } catch (err) {
    throw new Error(
      `Failed to parse LLM analysis: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function normalizeAnalysis(
  data: Partial<SourceAnalysis>,
  document: NormalizedDocument,
  schema: WikiSchemaConfig,
): SourceAnalysis {
  const entities = (data.entities ?? []).map((e) =>
    normalizeEntity(e, document, schema),
  );
  const concepts = (data.concepts ?? []).map((c) =>
    normalizeConcept(c, document, schema),
  );

  return {
    wikiId: document.wikiId,
    sourceId: document.sourceId,
    sourceTitle: document.title,
    summary: data.summary ?? "",
    entities,
    concepts,
    contradictions: data.contradictions ?? [],
    relatedPages: [],
    keyPoints: data.keyPoints ?? [],
    createdPages: [],
    updatedPages: [],
  };
}

function normalizeEntity(
  e: Partial<EntityInfo>,
  document: NormalizedDocument,
  schema: WikiSchemaConfig,
): EntityInfo {
  return {
    name: e.name ?? "Unknown",
    type: normalizeEntityType(e.type, schema),
    aliases: e.aliases ?? [],
    summary: e.summary ?? "",
    mentions: normalizeMentions(e.mentions ?? [], document),
    relatedEntities: e.relatedEntities ?? [],
    relatedConcepts: e.relatedConcepts ?? [],
  };
}

function normalizeConcept(
  c: Partial<ConceptInfo>,
  document: NormalizedDocument,
  schema: WikiSchemaConfig,
): ConceptInfo {
  return {
    name: c.name ?? "Unknown",
    type: normalizeConceptType(c.type, schema),
    aliases: c.aliases ?? [],
    summary: c.summary ?? "",
    mentions: normalizeMentions(c.mentions ?? [], document),
    relatedConcepts: c.relatedConcepts ?? [],
    relatedEntities: c.relatedEntities ?? [],
  };
}

function normalizeMentions(
  mentions: Partial<Mention>[],
  document: NormalizedDocument,
): Mention[] {
  return mentions.map((m, i) => {
    const chunk =
      document.chunks.find((c) => c.id === m.chunkId) ??
      document.chunks[i] ??
      document.chunks[0];
    return {
      quote: m.quote ?? "",
      chunkId: chunk?.id,
      locator: chunk?.locator ?? { kind: "plain", label: "source" },
    };
  });
}

/** Deterministic analyzer for tests without LLM. */
export class MockSourceAnalyzer implements SourceAnalyzer {
  async analyze(
    document: NormalizedDocument,
    _schema: WikiSchemaConfig,
  ): Promise<SourceAnalysis> {
    return {
      wikiId: document.wikiId,
      sourceId: document.sourceId,
      sourceTitle: document.title,
      summary: document.fullText.slice(0, 200) || document.title,
      entities: [],
      concepts: [],
      contradictions: [],
      relatedPages: [],
      keyPoints: [],
      createdPages: [],
      updatedPages: [],
    };
  }
}
