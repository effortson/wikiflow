import type { SourceId } from "./normalized-document";
import type { WikiId } from "./wiki-instance";

export interface QueryCatalogEntry {
  path: string;
  type: "entity" | "concept" | "source";
  title: string;
  aliases: string[];
  excerpt: string;
  updated: string;
  sources: SourceId[];
}

export interface QueryCatalog {
  wikiId: WikiId;
  builtAt: string;
  pages: QueryCatalogEntry[];
}

export interface QueryOptions {
  maxPages?: number;
  maxContextTokens?: number;
  keywordCandidateLimit?: number;
}
