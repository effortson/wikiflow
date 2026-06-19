import type { CachedExtract } from "./types/cached-extract";
import type { NormalizedDocument } from "./types/normalized-document";
import type { WikiId } from "./types/wiki-instance";

export interface BindExtractContextInput {
  wikiId: WikiId;
  sourceId: string;
  title?: string;
}

/** Title priority: ctx.title → sourceId basename → cached.title */
export function bindExtractContext(
  cached: CachedExtract,
  ctx: BindExtractContextInput,
): NormalizedDocument {
  const title =
    ctx.title?.trim() ||
    basenameFromPath(ctx.sourceId) ||
    cached.title;

  return {
    schemaVersion: 1,
    wikiId: ctx.wikiId,
    sourceId: ctx.sourceId,
    contentHash: cached.contentHash,
    mimeType: cached.mimeType,
    title,
    language: cached.language,
    fullText: cached.fullText,
    chunks: cached.chunks,
    metadata: cached.metadata,
    warnings: cached.warnings,
  };
}

function basenameFromPath(path: string): string {
  const base = path.split("/").pop() ?? path;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}
