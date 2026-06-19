import { matchGlob } from "@shared/glob";
import { sha256Hex } from "@shared/hash";
import { slugify } from "@shared/slug";
import { parseMarkdown } from "@shared/frontmatter";
import type { IngestReport, IngestWikiOptions } from "@shared/types/ingest-report";
import type { WikiInstance } from "@shared/types/wiki-instance";
import type { CoreServices } from "../core/core-services";
import type { WikiService } from "./service";
import { publishIngestProgress } from "./ingest-progress-publisher";
import { TFile, TFolder, type Vault } from "obsidian";

export interface IngestWikiDeps {
  core: CoreServices;
  vault: Vault;
  wikiService: WikiService;
  findWiki: (wikiId: string) => WikiInstance | undefined;
  getConcurrency: () => number;
}

export async function ingestWiki(
  deps: IngestWikiDeps,
  wikiId: string,
  options: IngestWikiOptions = {},
): Promise<IngestReport> {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const wiki = deps.findWiki(wikiId);
  if (!wiki) {
    return emptyFailedReport(wikiId, startedAt, startMs, `Wiki not found: ${wikiId}`);
  }

  const glob = options.glob ?? "**/*";
  const skipUnchanged = options.skipUnchanged ?? true;
  const concurrency = options.concurrency ?? deps.getConcurrency();

  const files = listSourceMarkdownFiles(deps.vault, wiki.sourceRoot).filter(
    (file) => {
      const rel = file.path.slice(wiki.sourceRoot.length + 1);
      return matchGlob(rel, glob);
    },
  );

  publishIngestProgress(deps.core, {
    wikiId,
    phase: "wiki_preparing",
    fileTotal: files.length,
  });

  const createdPages = new Set<string>();
  const updatedPages = new Set<string>();
  const skippedPages: string[] = [];
  const errors: IngestReport["errors"] = [];

  let fileOrdinal = 0;

  await mapPool(files, concurrency, async (file) => {
    const fileIndex = ++fileOrdinal;
    const progress = { fileIndex, fileTotal: files.length };
    try {
      if (skipUnchanged && (await isUnchanged(deps, wiki, file))) {
        publishIngestProgress(deps.core, {
          wikiId,
          sourceId: file.path,
          fileName: file.basename,
          phase: "skipping",
          ...progress,
        });
        skippedPages.push(file.path);
        return;
      }
      publishIngestProgress(deps.core, {
        wikiId,
        sourceId: file.path,
        fileName: file.basename,
        phase: "starting",
        ...progress,
      });
      const report = await deps.wikiService.ingestFile(file, {
        wikiId,
        mergePolicy: options.mergePolicy,
        progress,
        deferIndexUpdate: true,
      });
      for (const p of report.createdPages) createdPages.add(p);
      for (const p of report.updatedPages) updatedPages.add(p);
      if (report.errors.length) errors.push(...report.errors);
    } catch (err) {
      errors.push({
        sourceId: file.path,
        code: "extract_failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  await deps.wikiService.finalizeWikiIngest(wikiId);

  const status =
    errors.length === 0
      ? "completed"
      : errors.length < files.length
        ? "partial"
        : "failed";

  const report: IngestReport = {
    wikiId,
    status,
    createdPages: [...createdPages],
    updatedPages: [...updatedPages],
    skippedPages,
    errors,
    durationMs: Date.now() - startMs,
    startedAt,
    finishedAt: new Date().toISOString(),
  };

  deps.core.events.publish("ingest:done", { wikiId, report });
  return report;
}

async function isUnchanged(
  deps: IngestWikiDeps,
  wiki: WikiInstance,
  file: TFile,
): Promise<boolean> {
  const bytes = await deps.vault.readBinary(file);
  const hash = await sha256Hex(bytes);

  const sourcePath = `${wiki.wikiRoot}/sources/${slugify(file.basename)}.md`;
  if (!(await deps.core.vault.exists(sourcePath))) return false;

  const raw = await deps.core.vault.readText(sourcePath);
  const { frontmatter } = parseMarkdown(raw);
  const sources = frontmatter.sources;
  if (!Array.isArray(sources) || !sources.map(String).includes(file.path)) {
    return false;
  }

  const storedHash =
    frontmatter.rawContentHash ?? frontmatter.sourceContentHash ?? null;
  if (storedHash && String(storedHash) === hash) return true;

  const cached = await deps.core.cache.get(hash);
  return Boolean(cached?.metadata?.extractorId);
}

function listSourceMarkdownFiles(vault: Vault, sourceRoot: string): TFile[] {
  const root = vault.getAbstractFileByPath(sourceRoot);
  if (!(root instanceof TFolder)) return [];

  const files: TFile[] = [];
  const walk = (folder: TFolder) => {
    for (const child of folder.children) {
      if (child instanceof TFile) {
        if (child.extension.toLowerCase() === "md") files.push(child);
      } else if (child instanceof TFolder) walk(child);
    }
  };
  walk(root);
  return files;
}

async function mapPool<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (item === undefined) return;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

function emptyFailedReport(
  wikiId: string,
  startedAt: string,
  startMs: number,
  message: string,
): IngestReport {
  return {
    wikiId,
    status: "failed",
    createdPages: [],
    updatedPages: [],
    skippedPages: [],
    errors: [{ code: "write_failed", message }],
    durationMs: Date.now() - startMs,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}
