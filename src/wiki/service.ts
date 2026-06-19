import type { NormalizedDocument, ExtractOptions } from "@shared/types/normalized-document";
import type { IngestReport, IngestWikiOptions } from "@shared/types/ingest-report";
import type { QueryChunk } from "@shared/types/query-chunk";
import type { QueryOptions } from "@shared/types/query-catalog";
import type { IngestOptions, LintOptions, LintReport } from "@shared/types/wiki";
import type { WikiId, WikiInstance } from "@shared/types/wiki-instance";
import type { TFile } from "obsidian";
import type { GenerateSchemaResult } from "./schema/schema-generator";
import type { RawToSourceResult } from "./source/raw-to-source";

export interface WikiService {
  listWikis(): Promise<WikiInstance[]>;

  extractRawToSource(wikiId: WikiId): Promise<RawToSourceResult>;
  extractRawFile(file: TFile): Promise<RawToSourceResult>;

  extract(file: TFile, options?: ExtractOptions): Promise<NormalizedDocument>;
  ingest(
    document: NormalizedDocument,
    options?: IngestOptions,
  ): Promise<IngestReport>;
  ingestFile(file: TFile, options?: IngestOptions): Promise<IngestReport>;
  ingestWiki(
    wikiId: WikiId,
    options?: IngestWikiOptions,
  ): Promise<IngestReport>;

  query(
    wikiId: WikiId,
    question: string,
    options?: QueryOptions,
  ): AsyncIterable<QueryChunk>;
  lint(wikiId: WikiId, options?: LintOptions): Promise<LintReport>;
  regenerateIndex(wikiId: WikiId): Promise<void>;
  finalizeWikiIngest(wikiId: WikiId): Promise<void>;
  generateSchema(wikiId: WikiId): Promise<GenerateSchemaResult>;
}

function notImplemented(method: string): never {
  throw new Error(`${method} is not implemented yet`);
}

export class StubWikiService implements WikiService {
  private listFn: () => Promise<WikiInstance[]>;

  constructor(listFn: () => Promise<WikiInstance[]>) {
    this.listFn = listFn;
  }

  listWikis(): Promise<WikiInstance[]> {
    return this.listFn();
  }

  extractRawToSource(_wikiId: WikiId): Promise<RawToSourceResult> {
    return Promise.reject(notImplemented("WikiService.extractRawToSource"));
  }

  extractRawFile(_file: TFile): Promise<RawToSourceResult> {
    return Promise.reject(notImplemented("WikiService.extractRawFile"));
  }

  extract(_file: TFile, _options?: ExtractOptions): Promise<NormalizedDocument> {
    return Promise.reject(notImplemented("WikiService.extract"));
  }

  ingest(
    _document: NormalizedDocument,
    _options?: IngestOptions,
  ): Promise<IngestReport> {
    return Promise.reject(notImplemented("WikiService.ingest"));
  }

  ingestFile(_file: TFile, _options?: IngestOptions): Promise<IngestReport> {
    return Promise.reject(notImplemented("WikiService.ingestFile"));
  }

  ingestWiki(
    _wikiId: WikiId,
    _options?: IngestWikiOptions,
  ): Promise<IngestReport> {
    return Promise.reject(notImplemented("WikiService.ingestWiki"));
  }

  async *query(
    _wikiId: WikiId,
    _question: string,
    _options?: QueryOptions,
  ): AsyncIterable<QueryChunk> {
    throw notImplemented("WikiService.query");
  }

  lint(_wikiId: WikiId, _options?: LintOptions): Promise<LintReport> {
    return Promise.reject(notImplemented("WikiService.lint"));
  }

  regenerateIndex(_wikiId: WikiId): Promise<void> {
    return Promise.reject(notImplemented("WikiService.regenerateIndex"));
  }

  finalizeWikiIngest(_wikiId: WikiId): Promise<void> {
    return Promise.reject(notImplemented("WikiService.finalizeWikiIngest"));
  }

  generateSchema(_wikiId: WikiId): Promise<GenerateSchemaResult> {
    return Promise.reject(notImplemented("WikiService.generateSchema"));
  }
}
