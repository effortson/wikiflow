import { bindExtractContext } from "@shared/bind-extract-context";
import { sha256Hex } from "@shared/hash";
import type {
  ExtractOptions,
  NormalizedDocument,
} from "@shared/types/normalized-document";
import type { CachedExtract } from "@shared/types/cached-extract";
import type { CoreServices } from "../core/core-services";
import { resolveWikiId } from "./instance-resolver";
import { ExtractorRegistry } from "./extractors/registry";
import { publishIngestProgress } from "./ingest-progress-publisher";
import { isUnderFolder } from "./source/source-paths";
import { parseWikiFlowSource } from "./source/source-markdown";
import type { TFile } from "obsidian";

export interface ExtractDeps {
  core: CoreServices;
  registry: ExtractorRegistry;
  getRawFolder: () => string;
  getSourceFolder: () => string;
  getLanguage: () => string;
  pluginVersion: string;
}

export async function extractDocument(
  deps: ExtractDeps,
  file: TFile,
  options: ExtractOptions = {},
  signal?: AbortSignal,
): Promise<NormalizedDocument> {
  const sourceFolder = deps.getSourceFolder();
  if (isUnderFolder(file.path, sourceFolder)) {
    return extractSourceMarkdown(deps, file, options, signal);
  }

  throw new Error(
    `Wiki ingest must read from ${sourceFolder}/{wikiId}/. Convert raw files first.`,
  );
}

async function extractSourceMarkdown(
  deps: ExtractDeps,
  file: TFile,
  options: ExtractOptions,
  signal?: AbortSignal,
): Promise<NormalizedDocument> {
  const { core, getSourceFolder, pluginVersion } = deps;
  const sourceId = file.path;
  const wikiId = resolveWikiId(sourceId, getSourceFolder());
  if (!wikiId) {
    throw new Error(
      `Cannot resolve wikiId for ${sourceId}; file must live under ${getSourceFolder()}/{wikiId}/`,
    );
  }

  if (signal?.aborted) throw new Error("Extract cancelled");

  const bytes = await core.vault.getVault().readBinary(file);
  const contentHash = await sha256Hex(bytes);
  const text = new TextDecoder("utf-8").decode(bytes);
  const { meta, body } = parseWikiFlowSource(text);
  const title = file.basename.replace(/\.md$/i, "");

  const cached = buildSourceCachedExtract({
    contentHash,
    title,
    body,
    meta,
    pluginVersion,
  });

  const existing = await core.cache.get(contentHash);
  if (existing && existing.metadata.extractorId === "source-markdown") {
    publishIngestProgress(core, {
      wikiId,
      sourceId,
      fileName: file.basename,
      phase: "extract_cached",
      fileIndex: options.progress?.fileIndex,
      fileTotal: options.progress?.fileTotal,
    });
    await core.cache.recordReference(contentHash, sourceId);
    const doc = bindExtractContext(existing, { wikiId, sourceId, title });
    core.events.publish("extract:done", { wikiId, sourceId, contentHash });
    return doc;
  }

  publishIngestProgress(core, {
    wikiId,
    sourceId,
    fileName: file.basename,
    phase: "extracting",
    fileIndex: options.progress?.fileIndex,
    fileTotal: options.progress?.fileTotal,
  });

  await core.cache.put(contentHash, cached);
  await core.cache.recordReference(contentHash, sourceId);

  const doc = bindExtractContext(cached, { wikiId, sourceId, title });
  core.events.publish("extract:done", { wikiId, sourceId, contentHash });
  return doc;
}

function buildSourceCachedExtract(input: {
  contentHash: string;
  title: string;
  body: string;
  meta: ReturnType<typeof parseWikiFlowSource>["meta"];
  pluginVersion: string;
}): CachedExtract {
  const paragraphs = input.body.trim()
    ? input.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    : [""];

  let offset = 0;
  const chunks = paragraphs.map((text, i) => {
    const chunk = {
      id: `chunk-${String(i + 1).padStart(3, "0")}`,
      text,
      locator: { kind: "plain" as const, label: `§${i + 1}` },
      sequence: i + 1,
      charOffset: offset,
    };
    offset += text.length + 2;
    return chunk;
  });

  return {
    schemaVersion: 1,
    contentHash: input.contentHash,
    mimeType: "text/markdown",
    title: input.title,
    fullText: input.body.trim(),
    chunks,
    metadata: {
      extractedAt: new Date().toISOString(),
      extractorId: "source-markdown",
      extractorVersion: "1.0.0",
      pluginVersion: input.pluginVersion,
      stats: { format: "plain" },
    },
    warnings: input.meta?.rawPath
      ? undefined
      : [
          {
            code: "unsupported_feature" as const,
            message: "Source markdown missing wikiflowSource frontmatter",
          },
        ],
  };
}
