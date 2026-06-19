import { parseMarkdown } from "@shared/frontmatter";
import type {
  QueryCatalog,
  QueryCatalogEntry,
} from "@shared/types/query-catalog";
import type { WikiInstance } from "@shared/types/wiki-instance";
import type { VaultAdapter } from "../../core/vault/vault-adapter";

const INDEX_ROOT = ".wikiflow/index";

export class QueryCatalogStore {
  constructor(
    private vault: VaultAdapter,
    private pluginVersion: string,
  ) {}

  catalogDir(wikiId: string): string {
    return `${INDEX_ROOT}/${wikiId}`;
  }

  catalogPath(wikiId: string): string {
    return `${this.catalogDir(wikiId)}/catalog.json`;
  }

  metaPath(wikiId: string): string {
    return `${this.catalogDir(wikiId)}/catalog.meta.json`;
  }

  async load(wikiId: string): Promise<QueryCatalog | null> {
    const path = this.catalogPath(wikiId);
    if (!(await this.vault.exists(path))) return null;
    try {
      return JSON.parse(await this.vault.readText(path)) as QueryCatalog;
    } catch {
      return null;
    }
  }

  async save(catalog: QueryCatalog): Promise<void> {
    await this.vault.mkdir(this.catalogDir(catalog.wikiId));
    await this.vault.writeText(
      this.catalogPath(catalog.wikiId),
      JSON.stringify(catalog, null, 2),
    );
    await this.vault.writeText(
      this.metaPath(catalog.wikiId),
      JSON.stringify(
        {
          builtAt: catalog.builtAt,
          pageCount: catalog.pages.length,
          pluginVersion: this.pluginVersion,
        },
        null,
        2,
      ),
    );
  }

  async regenerate(wiki: WikiInstance): Promise<QueryCatalog> {
    const paths = await this.listWikiPages(wiki);
    const pages: QueryCatalogEntry[] = [];
    for (const path of paths) {
      const entry = await this.pageToEntry(path);
      if (entry) pages.push(entry);
    }
    const catalog: QueryCatalog = {
      wikiId: wiki.wikiId,
      builtAt: new Date().toISOString(),
      pages: pages.sort((a, b) => a.path.localeCompare(b.path)),
    };
    await this.save(catalog);
    return catalog;
  }

  async upsertPages(wikiId: string, pagePaths: string[]): Promise<void> {
    const catalog =
      (await this.load(wikiId)) ??
      ({
        wikiId,
        builtAt: new Date().toISOString(),
        pages: [],
      } satisfies QueryCatalog);

    const map = new Map(catalog.pages.map((p) => [p.path, p]));
    for (const path of pagePaths) {
      const entry = await this.pageToEntry(path);
      if (entry) map.set(path, entry);
    }

    catalog.pages = [...map.values()].sort((a, b) =>
      a.path.localeCompare(b.path),
    );
    catalog.builtAt = new Date().toISOString();
    await this.save(catalog);
  }

  private async listWikiPages(wiki: WikiInstance): Promise<string[]> {
    const folders = ["sources", "entities", "concepts"];
    const paths: string[] = [];
    for (const folder of folders) {
      const dir = `${wiki.wikiRoot}/${folder}`;
      if (!(await this.vault.exists(dir))) continue;
      for (const p of this.vault.listFolder(dir)) {
        if (p.endsWith(".md")) paths.push(p);
      }
    }
    return paths;
  }

  private async pageToEntry(path: string): Promise<QueryCatalogEntry | null> {
    if (!(await this.vault.exists(path))) return null;
    const raw = await this.vault.readText(path);
    const { frontmatter, body } = parseMarkdown(raw);
    const type = frontmatter.type;
    if (type !== "entity" && type !== "concept" && type !== "source") {
      return null;
    }

    const title = extractTitle(body, path);
    const aliases = Array.isArray(frontmatter.aliases)
      ? frontmatter.aliases.map(String)
      : [];
    const sources = Array.isArray(frontmatter.sources)
      ? frontmatter.sources.map(String)
      : [];
    const updated = String(frontmatter.updated ?? "");

    return {
      path,
      type,
      title,
      aliases,
      excerpt: excerptFromBody(body),
      updated,
      sources,
    };
  }
}

export function extractTitle(body: string, path: string): string {
  const match = body.match(/^#\s+(.+)$/m);
  if (match) return match[1].trim();
  return path.split("/").pop()?.replace(/\.md$/, "") ?? path;
}

export function excerptFromBody(body: string, maxLen = 320): string {
  const text = body
    .replace(/^#+\s+.+$/gm, "")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, _path, label) => label ?? _path)
    .replace(/\s+/g, " ")
    .trim();
  return text.length <= maxLen ? text : `${text.slice(0, maxLen)}…`;
}

/** Keyword recall scoring for Phase 3. */
export function keywordRecall(
  catalog: QueryCatalog,
  question: string,
  limit: number,
): QueryCatalogEntry[] {
  const terms = tokenize(question);
  if (!terms.length) return catalog.pages.slice(0, limit);

  const scored = catalog.pages.map((page) => {
    const haystack = [page.title, ...page.aliases, page.excerpt]
      .join(" ")
      .toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (haystack.includes(term)) score += term.length > 3 ? 2 : 1;
    }
    return { page, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.page);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1);
}
