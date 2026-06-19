import type { IngestReport } from "@shared/types/ingest-report";
import type { IngestOptions, MergePolicy } from "@shared/types/wiki";
import type { NormalizedDocument } from "@shared/types/normalized-document";
import type { WikiInstance } from "@shared/types/wiki-instance";
import type { WikiLanguage } from "@shared/wiki-language";
import type { CoreServices } from "../../core/core-services";
import { SchemaManager } from "../schema/schema-manager";
import { EntityResolver } from "./entity-resolver";
import { PageFactory } from "./page-factory";
import { LlmSourceAnalyzer, type SourceAnalyzer } from "./source-analyzer";
import { resolveWikiId } from "../instance-resolver";
import { appendWikiLog } from "./log-writer";
import { writeWikiIndex } from "./index-writer";
import { QueryCatalogStore } from "./query-catalog";
import {
  basenameFromPath,
  publishIngestProgress,
} from "../ingest-progress-publisher";

export interface WikiEngineDeps {
  core: CoreServices;
  getSourceFolder: () => string;
  getWikiRoot: () => string;
  getSchemaRoot: () => string;
  getLanguage: () => WikiLanguage;
  findWiki: (wikiId: string) => WikiInstance | undefined;
  analyzer?: SourceAnalyzer;
  pluginVersion: string;
}

export class WikiEngine {
  private schema: SchemaManager;
  private factory: PageFactory;
  private analyzer: SourceAnalyzer;
  private catalog: QueryCatalogStore;

  constructor(private deps: WikiEngineDeps) {
    this.schema = new SchemaManager(deps.core.vault, deps.getLanguage);
    this.factory = new PageFactory(
      deps.core.vault,
      new EntityResolver(deps.core.vault),
      deps.getLanguage,
    );
    this.catalog = new QueryCatalogStore(deps.core.vault, deps.pluginVersion);
    this.analyzer =
      deps.analyzer ??
      new LlmSourceAnalyzer(
        deps.core.llm,
        deps.core.logger,
        deps.getLanguage,
      );
  }

  getCatalogStore(): QueryCatalogStore {
    return this.catalog;
  }

  async ingest(
    document: NormalizedDocument,
    options: IngestOptions = {},
  ): Promise<IngestReport> {
    const startedAt = new Date().toISOString();
    const startMs = Date.now();
    const mergePolicy: MergePolicy = options.mergePolicy ?? "merge";

    const resolvedWikiId = resolveWikiId(
      document.sourceId,
      this.deps.getSourceFolder(),
    );
    if (!resolvedWikiId) {
      return failedReport(document.wikiId, startedAt, startMs, {
        code: "wiki_mismatch",
        message: `Invalid sourceId: ${document.sourceId}`,
      });
    }

    if (options.wikiId && options.wikiId !== resolvedWikiId) {
      return failedReport(document.wikiId, startedAt, startMs, {
        code: "wiki_mismatch",
        message: `wikiId mismatch: expected ${resolvedWikiId}, got ${options.wikiId}`,
      });
    }

    const wiki = this.deps.findWiki(resolvedWikiId);
    if (!wiki) {
      return failedReport(resolvedWikiId, startedAt, startMs, {
        code: "write_failed",
        message: `Wiki instance not found: ${resolvedWikiId}`,
      });
    }

    try {
      const schemaConfig = await this.schema.load(wiki);
      publishIngestProgress(this.deps.core, {
        wikiId: wiki.wikiId,
        sourceId: document.sourceId,
        fileName: basenameFromPath(document.sourceId),
        phase: "analyzing",
        fileIndex: options.progress?.fileIndex,
        fileTotal: options.progress?.fileTotal,
      });
      const analysis = await this.analyzer.analyze(document, schemaConfig);

      const createdPages: string[] = [];
      const updatedPages: string[] = [];
      const skippedPages: string[] = [];

      publishIngestProgress(this.deps.core, {
        wikiId: wiki.wikiId,
        sourceId: document.sourceId,
        fileName: basenameFromPath(document.sourceId),
        phase: "writing",
        fileIndex: options.progress?.fileIndex,
        fileTotal: options.progress?.fileTotal,
      });
      const source = await this.factory.writeSourcePage(
        wiki,
        analysis,
        mergePolicy,
        document,
      );
      (source.created ? createdPages : updatedPages).push(source.path);

      for (const p of await this.factory.writeEntityPages(
        wiki,
        schemaConfig,
        analysis.entities,
        analysis,
        mergePolicy,
        document,
      )) {
        (p.created ? createdPages : updatedPages).push(p.path);
      }

      for (const p of await this.factory.writeConceptPages(
        wiki,
        schemaConfig,
        analysis.concepts,
        analysis,
        mergePolicy,
        document,
      )) {
        (p.created ? createdPages : updatedPages).push(p.path);
      }

      if (!options.deferIndexUpdate) {
        await writeWikiIndex(this.deps.core.vault, wiki);
        publishIngestProgress(this.deps.core, {
          wikiId: wiki.wikiId,
          sourceId: document.sourceId,
          fileName: basenameFromPath(document.sourceId),
          phase: "indexing",
          fileIndex: options.progress?.fileIndex,
          fileTotal: options.progress?.fileTotal,
        });
        await this.catalog.upsertPages(wiki.wikiId, [
          ...createdPages,
          ...updatedPages,
        ]);
      }
      await appendWikiLog(this.deps.core.vault, wiki, {
        action: "ingest",
        sourceId: document.sourceId,
        created: createdPages.length,
        updated: updatedPages.length,
      });

      const report: IngestReport = {
        wikiId: wiki.wikiId,
        sourceId: document.sourceId,
        status: "completed",
        createdPages,
        updatedPages,
        skippedPages,
        errors: [],
        durationMs: Date.now() - startMs,
        startedAt,
        finishedAt: new Date().toISOString(),
      };

      if (!options.deferIndexUpdate) {
        this.deps.core.events.publish("ingest:done", {
          wikiId: wiki.wikiId,
          report,
        });
      }

      return report;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code =
        err instanceof Error && err.name === "LlmError"
          ? "llm_failed"
          : message.toLowerCase().includes("llm")
            ? "llm_failed"
            : "write_failed";
      const report = failedReport(wiki.wikiId, startedAt, startMs, {
        code,
        message,
        sourceId: document.sourceId,
      });
      this.deps.core.events.publish("ingest:done", {
        wikiId: wiki.wikiId,
        report,
      });
      return report;
    }
  }
}

function failedReport(
  wikiId: string,
  startedAt: string,
  startMs: number,
  error: {
    code: "wiki_mismatch" | "llm_failed" | "write_failed";
    message: string;
    sourceId?: string;
  },
): IngestReport {
  return {
    wikiId,
    sourceId: error.sourceId,
    status: "failed",
    createdPages: [],
    updatedPages: [],
    skippedPages: [],
    errors: [
      {
        code: error.code,
        message: error.message,
        sourceId: error.sourceId,
      },
    ],
    durationMs: Date.now() - startMs,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}
