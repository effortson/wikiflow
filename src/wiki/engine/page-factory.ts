import { todayIsoDate } from "@shared/frontmatter";
import { formatLocator } from "@shared/locator-format";
import {
  extractMarkdownTables,
  formatTablesSection,
  tablesRelevantToTerms,
} from "@shared/markdown-tables";
import { slugify } from "@shared/slug";
import type { NormalizedDocument } from "@shared/types/normalized-document";
import type {
  ConceptInfo,
  ContradictionInfo,
  EntityInfo,
  Mention,
  SourceAnalysis,
} from "@shared/types/wiki";
import type { MergePolicy } from "@shared/types/wiki";
import type { WikiInstance } from "@shared/types/wiki-instance";
import type { WikiSchemaConfig } from "@shared/types/wiki-schema";
import {
  normalizeWikiLanguage,
  wikiLanguageTablesSectionHeading,
  type WikiLanguage,
} from "@shared/wiki-language";
import type { VaultAdapter } from "../../core/vault/vault-adapter";
import { EntityResolver } from "./entity-resolver";
import { mergeWikiPage } from "./merge";

export function sourceSlug(analysis: SourceAnalysis): string {
  const fallback = analysis.sourceId.split("/").pop() ?? "untitled";
  const basename = fallback.replace(/\.[^.]+$/, "");
  return slugify(analysis.sourceTitle || basename);
}

export class PageFactory {
  constructor(
    private vault: VaultAdapter,
    private resolver: EntityResolver,
    private getLanguage: () => WikiLanguage = () => "zh",
  ) {}

  async writeSourcePage(
    wiki: WikiInstance,
    analysis: SourceAnalysis,
    mergePolicy: MergePolicy,
    document?: NormalizedDocument,
  ): Promise<{ path: string; created: boolean }> {
    await this.ensureDirs(wiki);
    const slug = sourceSlug(analysis);
    const path = `${wiki.wikiRoot}/sources/${slug}.md`;
    const exists = await this.vault.exists(path);

    const mentionsBlock = buildMentionsBlock(
      analysis,
      wiki,
      `${wiki.wikiRoot}/sources/${slug}`,
    );
    const body = buildSourceBody(analysis, document, this.getLanguage);
    const contradictionsBlock = buildContradictionsBlock(analysis.contradictions);
    const fullBody = contradictionsBlock
      ? `${body.trim()}\n\n${contradictionsBlock}\n`
      : body;

    const fm = {
      type: "source",
      wikiId: wiki.wikiId,
      created: todayIsoDate(),
      updated: todayIsoDate(),
      sources: [analysis.sourceId],
      tags: [],
      reviewed: false,
      aliases: [],
    };

    const existing = exists ? await this.vault.readText(path) : null;
    const merged = mergeWikiPage({
      existingContent: existing,
      incomingFrontmatter: fm,
      incomingBody: fullBody,
      incomingMentionsBlock: mentionsBlock,
      incomingSummary: analysis.summary,
      mergePolicy,
    });

    await this.vault.writeText(path, merged.content);
    return { path, created: !exists };
  }

  async writeEntityPages(
    wiki: WikiInstance,
    schema: WikiSchemaConfig,
    entities: EntityInfo[],
    analysis: SourceAnalysis,
    mergePolicy: MergePolicy,
    document?: NormalizedDocument,
  ): Promise<{ path: string; created: boolean }[]> {
    const results: { path: string; created: boolean }[] = [];
    for (const entity of entities) {
      const resolved = await this.resolver.resolveEntity(
        wiki.wikiRoot,
        entity,
        schema,
      );
      const path = await this.writeKnowledgePage(
        wiki,
        resolved,
        "entity",
        entity.name,
        entity.type,
        entity.summary,
        entity.aliases ?? [],
        entity.mentions,
        analysis,
        mergePolicy,
        document,
      );
      results.push({ path, created: resolved.isNew });
    }
    return results;
  }

  async writeConceptPages(
    wiki: WikiInstance,
    schema: WikiSchemaConfig,
    concepts: ConceptInfo[],
    analysis: SourceAnalysis,
    mergePolicy: MergePolicy,
    document?: NormalizedDocument,
  ): Promise<{ path: string; created: boolean }[]> {
    const results: { path: string; created: boolean }[] = [];
    for (const concept of concepts) {
      const resolved = await this.resolver.resolveConcept(
        wiki.wikiRoot,
        concept,
        schema,
      );
      const path = await this.writeKnowledgePage(
        wiki,
        resolved,
        "concept",
        concept.name,
        concept.type,
        concept.summary,
        concept.aliases ?? [],
        concept.mentions,
        analysis,
        mergePolicy,
        document,
      );
      results.push({ path, created: resolved.isNew });
    }
    return results;
  }

  private async writeKnowledgePage(
    wiki: WikiInstance,
    resolved: { path: string; isNew: boolean },
    type: "entity" | "concept",
    name: string,
    tag: string,
    summary: string,
    aliases: string[],
    mentions: Mention[],
    analysis: SourceAnalysis,
    mergePolicy: MergePolicy,
    document?: NormalizedDocument,
  ): Promise<string> {
    const exists = await this.vault.exists(resolved.path);
    const fm = {
      type,
      wikiId: wiki.wikiId,
      created: todayIsoDate(),
      updated: todayIsoDate(),
      sources: [analysis.sourceId],
      tags: [tag],
      reviewed: false,
      aliases,
    };

    const sourceSlugValue = sourceSlug(analysis);
    const sourceLink = `${wiki.wikiRoot}/sources/${sourceSlugValue}`;
    const mentionsBlock = buildEntityMentions(mentions, wiki, sourceLink, analysis.sourceTitle);
    const tableSection = buildRelevantTablesSection(
      document,
      [name, ...aliases],
      this.getLanguage,
    );

    const existing = exists ? await this.vault.readText(resolved.path) : null;
    const merged = mergeWikiPage({
      existingContent: existing,
      incomingFrontmatter: fm,
      incomingBody: `\n# ${name}\n\n${summary}\n${tableSection}`,
      incomingMentionsBlock: mentionsBlock,
      incomingSummary: summary,
      mergePolicy,
    });

    await this.vault.writeText(resolved.path, merged.content);
    return resolved.path;
  }

  private async ensureDirs(wiki: WikiInstance): Promise<void> {
    await this.vault.mkdir(wiki.wikiRoot);
    await this.vault.mkdir(`${wiki.wikiRoot}/sources`);
    await this.vault.mkdir(`${wiki.wikiRoot}/entities`);
    await this.vault.mkdir(`${wiki.wikiRoot}/concepts`);
  }
}

function buildSourceBody(
  analysis: SourceAnalysis,
  document: NormalizedDocument | undefined,
  getLanguage: () => WikiLanguage,
): string {
  const language = normalizeWikiLanguage(getLanguage());
  const points =
    analysis.keyPoints.length > 0
      ? `## Key Points\n\n${analysis.keyPoints.map((p) => `- ${p}`).join("\n")}\n`
      : "";
  const tableSection = buildAllTablesSection(document, language);
  return `\n# ${analysis.sourceTitle}\n\n${points}${tableSection}`;
}

function buildAllTablesSection(
  document: NormalizedDocument | undefined,
  language: WikiLanguage,
): string {
  if (!document?.fullText) return "";
  const tables = extractMarkdownTables(document.fullText);
  return formatTablesSection(
    tables,
    wikiLanguageTablesSectionHeading(language),
  );
}

function buildRelevantTablesSection(
  document: NormalizedDocument | undefined,
  terms: string[],
  getLanguage: () => WikiLanguage,
): string {
  if (!document?.fullText) return "";
  const tables = tablesRelevantToTerms(document.fullText, terms);
  return formatTablesSection(
    tables,
    wikiLanguageTablesSectionHeading(normalizeWikiLanguage(getLanguage())),
  );
}

function buildMentionsBlock(
  analysis: SourceAnalysis,
  wiki: WikiInstance,
  selfPath: string,
): string {
  const allMentions = [
    ...analysis.entities.flatMap((e) => e.mentions),
    ...analysis.concepts.flatMap((c) => c.mentions),
  ];
  if (!allMentions.length) return "";
  const lines = allMentions.slice(0, 20).map((m) => formatMentionLine(m, wiki, selfPath, analysis.sourceTitle));
  return `## Mentions in Source\n\n${lines.join("\n")}`;
}

function buildEntityMentions(
  mentions: Mention[],
  wiki: WikiInstance,
  sourcePath: string,
  sourceTitle: string,
): string {
  if (!mentions.length) return "";
  const lines = mentions.map((m) =>
    formatMentionLine(m, wiki, sourcePath, sourceTitle),
  );
  return `## Mentions in Source\n\n${lines.join("\n")}`;
}

function formatMentionLine(
  m: Mention,
  _wiki: WikiInstance,
  sourcePath: string,
  sourceTitle: string,
): string {
  const loc = formatLocator(m.locator);
  return `- "${m.quote.replace(/"/g, '\\"')}" — [[${sourcePath}|${sourceTitle}]] (${loc})`;
}

function buildContradictionsBlock(
  contradictions: ContradictionInfo[],
): string {
  if (!contradictions.length) return "";
  const lines = contradictions.map((c) => {
    const claims = c.claims
      .map((cl) => `"${cl.quote.replace(/"/g, '\\"')}" (${cl.sourceId})`)
      .join("; ");
    return `- **${c.topic}:** ${c.description} — claims: ${claims}`;
  });
  return `## Contradictions\n\n${lines.join("\n")}`;
}
