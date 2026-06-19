import type { NormalizedDocument, ExtractOptions } from "@shared/types/normalized-document";
import type { IngestReport, IngestWikiOptions } from "@shared/types/ingest-report";
import type { QueryChunk } from "@shared/types/query-chunk";
import type { QueryOptions } from "@shared/types/query-catalog";
import type { IngestOptions, LintOptions, LintReport } from "@shared/types/wiki";
import type { WikiId, WikiInstance } from "@shared/types/wiki-instance";
import { getLanguage } from "obsidian";
import type { TFile } from "obsidian";
import type { CoreServices } from "../core/core-services";
import type { WikiService } from "./service";
import { resolveUiLocale } from "../i18n";
import { normalizeWikiLanguage, type WikiLanguage } from "@shared/wiki-language";
import { extractDocument } from "./extract";
import { createDefaultRegistry } from "./extractors/registry";
import { WikiEngine } from "./engine/wiki-engine";
import { ingestWiki as runIngestWiki } from "./ingest-wiki";
import { publishIngestProgress } from "./ingest-progress-publisher";
import { resolveWikiId } from "./instance-resolver";
import {
  syncRawFileToSource,
  syncWikiRawToSource,
  type RawToSourceResult,
} from "./source/raw-to-source";
import { isUnderFolder } from "./source/source-paths";
import { writeWikiIndex } from "./engine/index-writer";
import { QueryEngine } from "./engine/query-engine";
import { LintEngine } from "./engine/lint/lint-engine";
import type { GenerateSchemaResult } from "./schema/schema-generator";
import { generateWikiSchema } from "./schema/schema-generator";

export interface WikiServiceContext {
  core: CoreServices;
  getSettings: () => {
    rawFolder: string;
    sourceFolder: string;
    wikiRoot: string;
    schemaRoot: string;
    language: WikiLanguage;
    pageGenerationConcurrency: number;
  };
  listWikiInstances: () => WikiInstance[];
  pluginVersion: string;
}

export class EnterpriseWikiService implements WikiService {
  private registry = createDefaultRegistry();
  private engine: WikiEngine;
  private queryEngine: QueryEngine;
  private lintEngine: LintEngine;

  constructor(private ctx: WikiServiceContext) {
    const { core, getSettings, listWikiInstances, pluginVersion } = ctx;
    this.engine = new WikiEngine({
      core,
      getSourceFolder: () => getSettings().sourceFolder,
      getWikiRoot: () => getSettings().wikiRoot,
      getSchemaRoot: () => getSettings().schemaRoot,
      getLanguage: () => normalizeWikiLanguage(getSettings().language),
      findWiki: (wikiId) =>
        listWikiInstances().find((w) => w.wikiId === wikiId),
      pluginVersion,
    });
    this.queryEngine = new QueryEngine(
      core,
      () => normalizeWikiLanguage(resolveUiLocale(getLanguage())),
      pluginVersion,
    );
    this.lintEngine = new LintEngine(
      core.vault,
      core.vault.getVault(),
      () => normalizeWikiLanguage(getSettings().language),
    );
  }

  listWikis(): Promise<WikiInstance[]> {
    return Promise.resolve(this.ctx.listWikiInstances());
  }

  private rawToSourceDeps() {
    const settings = this.ctx.getSettings();
    return {
      core: this.ctx.core,
      registry: this.registry,
      vault: this.ctx.core.vault.getVault(),
      getRawFolder: () => settings.rawFolder,
      getSourceFolder: () => settings.sourceFolder,
      getLanguage: () => settings.language,
      pluginVersion: this.ctx.pluginVersion,
    };
  }

  async extractRawToSource(wikiId: WikiId): Promise<RawToSourceResult> {
    const wiki = this.ctx.listWikiInstances().find((w) => w.wikiId === wikiId);
    if (!wiki) {
      throw new Error(`Wiki not found: ${wikiId}`);
    }
    return syncWikiRawToSource(this.rawToSourceDeps(), wiki);
  }

  async extractRawFile(file: TFile): Promise<RawToSourceResult> {
    const settings = this.ctx.getSettings();
    if (!isUnderFolder(file.path, settings.rawFolder)) {
      throw new Error(
        `File must be under ${settings.rawFolder}/{wikiId}/`,
      );
    }
    const wikiId = resolveWikiId(file.path, settings.rawFolder);
    if (!wikiId) {
      throw new Error(`Cannot resolve wikiId for raw file: ${file.path}`);
    }
    const wiki = this.ctx.listWikiInstances().find((w) => w.wikiId === wikiId);
    const outcome = await syncRawFileToSource(
      this.rawToSourceDeps(),
      file,
      wiki,
    );
    if (outcome.status === "error") {
      throw new Error(outcome.message);
    }
    return {
      converted: outcome.status === "converted" ? [outcome.sourcePath] : [],
      skipped: outcome.status === "skipped" ? [outcome.sourcePath] : [],
      errors: [],
    };
  }

  extract(file: TFile, options?: ExtractOptions): Promise<NormalizedDocument> {
    return extractDocument(
      {
        core: this.ctx.core,
        registry: this.registry,
        getRawFolder: () => this.ctx.getSettings().rawFolder,
        getSourceFolder: () => this.ctx.getSettings().sourceFolder,
        getLanguage: () => this.ctx.getSettings().language,
        pluginVersion: this.ctx.pluginVersion,
      },
      file,
      options,
    );
  }

  ingest(
    document: NormalizedDocument,
    options?: IngestOptions,
  ): Promise<IngestReport> {
    return this.ctx.core.dedup.runIngest(
      document.wikiId,
      document.sourceId,
      () => this.engine.ingest(document, options),
    );
  }

  async ingestFile(
    file: TFile,
    options?: IngestOptions,
  ): Promise<IngestReport> {
    const settings = this.ctx.getSettings();
    const wikiId =
      options?.wikiId ?? resolveWikiId(file.path, settings.sourceFolder);

    if (!wikiId || !isUnderFolder(file.path, settings.sourceFolder)) {
      throw new Error(
        `Wiki ingest only reads ${settings.sourceFolder}/{wikiId}/. Run raw extract first.`,
      );
    }

    if (!options?.progress) {
      publishIngestProgress(this.ctx.core, {
        wikiId,
        sourceId: file.path,
        fileName: file.basename,
        phase: "starting",
      });
    }
    const document = await this.extract(file, { ...options, wikiId });
    return this.ingest(document, { ...options, wikiId });
  }

  ingestWiki(
    wikiId: WikiId,
    options?: IngestWikiOptions,
  ): Promise<IngestReport> {
    return runIngestWiki(
      {
        core: this.ctx.core,
        vault: this.ctx.core.vault.getVault(),
        wikiService: this,
        findWiki: (id) =>
          this.ctx.listWikiInstances().find((w) => w.wikiId === id),
        getConcurrency: () =>
          this.ctx.getSettings().pageGenerationConcurrency ?? 2,
      },
      wikiId,
      options,
    );
  }

  async *query(
    wikiId: WikiId,
    question: string,
    options?: QueryOptions,
  ): AsyncIterable<QueryChunk> {
    const wiki = this.ctx.listWikiInstances().find((w) => w.wikiId === wikiId);
    if (!wiki) {
      yield { kind: "error", message: `Wiki not found: ${wikiId}` };
      return;
    }
    yield* this.queryEngine.query(wiki, question, options);
  }

  async lint(wikiId: WikiId, options?: LintOptions): Promise<LintReport> {
    const wiki = this.ctx.listWikiInstances().find((w) => w.wikiId === wikiId);
    if (!wiki) {
      throw new Error(`Wiki not found: ${wikiId}`);
    }
    const report = await this.lintEngine.lint(wiki, options);
    this.ctx.core.events.publish("lint:done", { wikiId, report });
    return report;
  }

  async regenerateIndex(wikiId: WikiId): Promise<void> {
    const wiki = this.ctx.listWikiInstances().find((w) => w.wikiId === wikiId);
    if (!wiki) {
      throw new Error(`Wiki not found: ${wikiId}`);
    }
    await this.queryEngine.regenerateIndex(wiki);
  }

  async finalizeWikiIngest(wikiId: WikiId): Promise<void> {
    const wiki = this.ctx.listWikiInstances().find((w) => w.wikiId === wikiId);
    if (!wiki) {
      throw new Error(`Wiki not found: ${wikiId}`);
    }
    await writeWikiIndex(this.ctx.core.vault, wiki);
    await this.engine.getCatalogStore().regenerate(wiki);
  }

  async generateSchema(wikiId: WikiId): Promise<GenerateSchemaResult> {
    const wiki = this.ctx.listWikiInstances().find((w) => w.wikiId === wikiId);
    if (!wiki) {
      throw new Error(`Wiki not found: ${wikiId}`);
    }
    return generateWikiSchema(
      {
        vault: this.ctx.core.vault,
        llm: this.ctx.core.llm,
        getLanguage: () => normalizeWikiLanguage(this.ctx.getSettings().language),
      },
      wiki,
    );
  }
}

export function createWikiService(ctx: WikiServiceContext): WikiService {
  return new EnterpriseWikiService(ctx);
}

export type { WikiService } from "./service";
