import { matchGlob } from "@shared/glob";
import { sha256Hex } from "@shared/hash";
import { normalizeWikiLanguage } from "@shared/wiki-language";
import type { WikiInstance } from "@shared/types/wiki-instance";
import type { CoreServices } from "../../core/core-services";
import { resolveWikiId } from "../instance-resolver";
import type { ExtractorRegistry } from "../extractors/registry";
import { publishIngestProgress } from "../ingest-progress-publisher";
import { sourcePathForRaw } from "./source-paths";
import { buildSourceMarkdown, parseEnterpriseSource } from "./source-markdown";
import { TFile, TFolder, type Vault } from "obsidian";

export interface RawToSourceDeps {
  core: CoreServices;
  registry: ExtractorRegistry;
  vault: Vault;
  getRawFolder: () => string;
  getSourceFolder: () => string;
  getLanguage: () => string;
  pluginVersion: string;
}

export interface RawToSourceResult {
  converted: string[];
  skipped: string[];
  errors: { rawPath: string; message: string }[];
}

export async function syncWikiRawToSource(
  deps: RawToSourceDeps,
  wiki: WikiInstance,
  options: { glob?: string } = {},
): Promise<RawToSourceResult> {
  const result: RawToSourceResult = {
    converted: [],
    skipped: [],
    errors: [],
  };

  const rawFiles = listFiles(deps.vault, wiki.rawRoot).filter((file) => {
    const rel = file.path.slice(wiki.rawRoot.length + 1);
    const glob = options.glob ?? "**/*";
    return matchGlob(rel, glob);
  });
  for (const rawFile of rawFiles) {
    try {
      const outcome = await syncRawFileToSource(deps, rawFile, wiki);
      if (outcome.status === "converted") result.converted.push(outcome.sourcePath);
      else if (outcome.status === "skipped") result.skipped.push(outcome.sourcePath);
    } catch (err) {
      result.errors.push({
        rawPath: rawFile.path,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

export type SyncRawFileOutcome =
  | { status: "converted" | "skipped"; sourcePath: string; file: TFile }
  | { status: "error"; message: string };

export async function syncRawFileToSource(
  deps: RawToSourceDeps,
  rawFile: TFile,
  wiki?: WikiInstance,
): Promise<SyncRawFileOutcome> {
  const wikiId =
    wiki?.wikiId ??
    resolveWikiId(rawFile.path, deps.getRawFolder());
  if (!wikiId) {
    throw new Error(`Cannot resolve wikiId for raw file: ${rawFile.path}`);
  }

  const rawRoot = wiki?.rawRoot ?? `${deps.getRawFolder()}/${wikiId}`;
  const sourceRoot = wiki?.sourceRoot ?? `${deps.getSourceFolder()}/${wikiId}`;
  const sourcePath = sourcePathForRaw(rawFile.path, rawRoot, sourceRoot);

  publishIngestProgress(deps.core, {
    wikiId,
    sourceId: rawFile.path,
    fileName: rawFile.basename,
    phase: "converting",
  });

  const rawBytes = await deps.vault.readBinary(rawFile);
  const rawContentHash = await sha256Hex(rawBytes);

  if (await deps.core.vault.exists(sourcePath)) {
    const existing = await deps.core.vault.readText(sourcePath);
    const { meta } = parseEnterpriseSource(existing);
    if (meta?.rawContentHash === rawContentHash) {
      const file = deps.vault.getAbstractFileByPath(sourcePath);
      if (file instanceof TFile) {
        return { status: "skipped", sourcePath, file };
      }
    }
  }

  const language = normalizeWikiLanguage(deps.getLanguage());
  const cached = await deps.core.cache.get(rawContentHash);
  let extract = cached;
  if (!extract || !deps.registry.isCacheValid(extract, language)) {
    const extractor = deps.registry.route(rawFile);
    extract = await deps.core.dedup.runExtract(rawContentHash, () =>
      extractor.extractToCache(rawFile, {
        services: deps.core,
        signal: new AbortController().signal,
        options: {},
        wikiId,
        sourceId: rawFile.path,
        contentHash: rawContentHash,
        pluginVersion: deps.pluginVersion,
        language,
      }),
    );
    await deps.core.cache.put(rawContentHash, extract);
  }
  await deps.core.cache.recordReference(rawContentHash, rawFile.path);

  const markdown = buildSourceMarkdown(
    {
      enterpriseflowSource: true,
      wikiId,
      rawPath: rawFile.path,
      rawContentHash,
      convertedAt: new Date().toISOString(),
      extractorId: extract.metadata.extractorId,
      extractorVersion: extract.metadata.extractorVersion,
    },
    extract.fullText,
  );

  const dir = sourcePath.split("/").slice(0, -1).join("/");
  if (dir) await deps.core.vault.mkdir(dir);
  await deps.core.vault.writeText(sourcePath, markdown);

  const file = deps.vault.getAbstractFileByPath(sourcePath);
  if (!(file instanceof TFile)) {
    throw new Error(`Failed to read converted source file: ${sourcePath}`);
  }

  return { status: "converted", sourcePath, file };
}

function listFiles(vault: Vault, root: string): TFile[] {
  const folder = vault.getAbstractFileByPath(root);
  if (!(folder instanceof TFolder)) return [];

  const files: TFile[] = [];
  const walk = (dir: TFolder) => {
    for (const child of dir.children) {
      if (child instanceof TFile) files.push(child);
      else if (child instanceof TFolder) walk(child);
    }
  };
  walk(folder);
  return files;
}
