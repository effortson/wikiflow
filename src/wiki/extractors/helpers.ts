import type { CachedExtract } from "@shared/types/cached-extract";
import type { ContentHash, ExtractWarning } from "@shared/types/normalized-document";

export function makeCachedExtract(
  partial: Omit<CachedExtract, "schemaVersion"> & { schemaVersion?: 1 },
): CachedExtract {
  return { schemaVersion: 1, ...partial };
}

export function emptyTextWarning(): ExtractWarning {
  return {
    code: "empty_text",
    message: "No extractable text found in document",
  };
}

export function isEffectivelyEmpty(fullText: string): boolean {
  return !fullText.trim();
}

export type BytesReader = (contentHash: ContentHash) => Promise<ArrayBuffer>;
