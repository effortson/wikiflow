import type { SourceLocator, SourceId } from "./normalized-document";
import type { WikiId } from "./wiki-instance";
import type { IngestProgressContext } from "./normalized-document";

export type MergePolicy = "overwrite" | "merge" | "skip";

export interface PageMergeRules {
  body: MergePolicy | "skip-if-reviewed";
  sources: "union";
  aliases: "union";
  updated: "max";
  mentionsSection: "append" | "replace";
  summary: "fill-if-empty" | "replace";
}

export const DEFAULT_PAGE_MERGE_RULES: PageMergeRules = {
  body: "skip-if-reviewed",
  sources: "union",
  aliases: "union",
  updated: "max",
  mentionsSection: "append",
  summary: "fill-if-empty",
};

export interface Mention {
  quote: string;
  locator: SourceLocator;
  chunkId?: string;
}

export interface EntityInfo {
  name: string;
  type: string;
  aliases?: string[];
  summary: string;
  mentions: Mention[];
  relatedEntities?: string[];
  relatedConcepts?: string[];
}

export interface ConceptInfo {
  name: string;
  type: string;
  aliases?: string[];
  summary: string;
  mentions: Mention[];
  relatedConcepts: string[];
  relatedEntities?: string[];
}

export interface ContradictionInfo {
  topic: string;
  description: string;
  claims: {
    sourceId: SourceId;
    quote: string;
    locator?: SourceLocator;
    chunkId?: string;
  }[];
  relatedPages?: string[];
}

export interface SourceAnalysis {
  wikiId: WikiId;
  sourceId: SourceId;
  sourceTitle: string;
  summary: string;
  entities: EntityInfo[];
  concepts: ConceptInfo[];
  contradictions: ContradictionInfo[];
  relatedPages: string[];
  keyPoints: string[];
  createdPages: string[];
  updatedPages: string[];
}

export type LintSeverity = "error" | "warning" | "info";

export type LintIssueCode =
  | "duplicate_entity"
  | "orphan_page"
  | "dead_link"
  | "alias_collision"
  | "missing_wiki_id"
  | "schema_violation"
  | "raw_without_source"
  | "source_without_raw";

export interface LintIssue {
  code: LintIssueCode;
  severity: LintSeverity;
  message: string;
  pagePath?: string;
  relatedPaths?: string[];
  fixable: boolean;
}

export interface LintReport {
  wikiId: WikiId;
  startedAt: string;
  finishedAt: string;
  issues: LintIssue[];
  stats: {
    pagesScanned: number;
    rawFilesScanned: number;
    bySeverity: Record<LintSeverity, number>;
  };
}

export interface LintOptions {
  autoFix?: boolean;
}

export interface IngestOptions {
  wikiId?: WikiId;
  mergePolicy?: MergePolicy;
  progress?: IngestProgressContext;
  /** When true, skip per-file index/catalog writes (batch finalize after bulk ingest). */
  deferIndexUpdate?: boolean;
}
