import { estimateTokens } from "@shared/tokens";
import type { QueryChunk } from "@shared/types/query-chunk";
import type { QueryCatalogEntry, QueryOptions } from "@shared/types/query-catalog";
import type { WikiInstance } from "@shared/types/wiki-instance";
import {
  normalizeWikiLanguage,
  wikiLanguageQueryNoPagesError,
  type WikiLanguage,
} from "@shared/wiki-language";
import type { CoreServices } from "../../core/core-services";
import { parseMarkdown } from "@shared/frontmatter";
import {
  QueryCatalogStore,
  keywordRecall,
} from "./query-catalog";
import { resolveQueryPrompts } from "../query-prompts";
import { stripLlmNoise } from "@shared/strip-llm-noise";

const DEFAULTS = {
  maxPages: 5,
  maxContextTokens: 12_000,
  keywordCandidateLimit: 20,
};

export class QueryEngine {
  private catalog: QueryCatalogStore;

  constructor(
    private core: CoreServices,
    private getLanguage: () => WikiLanguage,
    pluginVersion: string,
  ) {
    this.catalog = new QueryCatalogStore(core.vault, pluginVersion);
  }

  getCatalogStore(): QueryCatalogStore {
    return this.catalog;
  }

  async regenerateIndex(wiki: WikiInstance): Promise<void> {
    await this.catalog.regenerate(wiki);
  }

  async *query(
    wiki: WikiInstance,
    question: string,
    options: QueryOptions = {},
  ): AsyncIterable<QueryChunk> {
    const maxPages = options.maxPages ?? DEFAULTS.maxPages;
    const maxContextTokens =
      options.maxContextTokens ?? DEFAULTS.maxContextTokens;
    const keywordCandidateLimit =
      options.keywordCandidateLimit ?? DEFAULTS.keywordCandidateLimit;

    let catalog = await this.catalog.load(wiki.wikiId);
    if (!catalog || catalog.pages.length === 0) {
      catalog = await this.catalog.regenerate(wiki);
    }

    const candidates = keywordRecall(catalog, question, keywordCandidateLimit);
    const recall =
      candidates.length > 0
        ? candidates
        : catalog.pages.slice(0, keywordCandidateLimit);
    const selectedPaths = await this.rerankWithLlm(
      question,
      recall,
      maxPages,
    );

    const pages = await this.loadPagesInOrder(selectedPaths, maxContextTokens);
    const language = normalizeWikiLanguage(this.getLanguage());
    if (!pages.length) {
      yield {
        kind: "error",
        message: wikiLanguageQueryNoPagesError(language),
      };
      return;
    }

    const context = pages
      .map((p) => `### [[${p.path}|${p.title}]]\n\n${p.body}`)
      .join("\n\n---\n\n");

    const { system, user } = resolveQueryPrompts({
      wikiId: wiki.wikiId,
      question,
      context,
      language,
      systemPrompt: options.systemPrompt,
      userPrompt: options.userPrompt,
    });

    try {
      const answer = stripLlmNoise(
        await this.core.llm.chat({
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      );

      yield { kind: "text", delta: answer };
      yield {
        kind: "done",
        answer,
        citedPaths: pages.map((p) => p.path),
      };
    } catch (err) {
      yield {
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async rerankWithLlm(
    question: string,
    candidates: QueryCatalogEntry[],
    maxPages: number,
  ): Promise<string[]> {
    if (!candidates.length) return [];
    if (candidates.length <= maxPages) {
      return candidates.map((c) => c.path);
    }

    const list = candidates
      .map(
        (c, i) =>
          `${i + 1}. path=${c.path} | title=${c.title} | excerpt=${c.excerpt.slice(0, 120)}`,
      )
      .join("\n");

    const raw = await this.core.llm.chat({
      messages: [
        {
          role: "system",
          content:
            "Select the most relevant wiki pages for the question. Respond with ONLY a JSON array of path strings, ordered by relevance. Max items as requested.",
        },
        {
          role: "user",
          content: `Question: ${question}\nMax pages: ${maxPages}\n\nCandidates:\n${list}`,
        },
      ],
      temperature: 0,
    });

    try {
      const match = raw.match(/\[[\s\S]*\]/);
      const paths = JSON.parse(match?.[0] ?? raw) as string[];
      const valid = new Set(candidates.map((c) => c.path));
      return paths.filter((p) => valid.has(p)).slice(0, maxPages);
    } catch {
      return candidates.slice(0, maxPages).map((c) => c.path);
    }
  }

  private async loadPagesInOrder(
    paths: string[],
    maxContextTokens: number,
  ): Promise<{ path: string; title: string; body: string }[]> {
    const loaded: { path: string; title: string; body: string }[] = [];
    let tokens = 0;

    for (const path of paths) {
      if (!(await this.core.vault.exists(path))) continue;
      const raw = await this.core.vault.readText(path);
      const { body } = parseMarkdown(raw);
      const pageTokens = estimateTokens(body);
      if (tokens + pageTokens > maxContextTokens) break;
      tokens += pageTokens;
      const title = path.split("/").pop()?.replace(/\.md$/, "") ?? path;
      loaded.push({ path, title, body: body.trim() });
    }

    return loaded;
  }
}
