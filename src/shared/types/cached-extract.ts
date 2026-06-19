import type { ContentHash, SourceId } from "./normalized-document";
import type {
  DocumentChunk,
  ExtractMetadata,
  ExtractWarning,
} from "./normalized-document";

export interface CachedExtract {
  schemaVersion: 1;
  contentHash: ContentHash;
  mimeType: string;
  title: string;
  language?: string;
  fullText: string;
  chunks: DocumentChunk[];
  metadata: ExtractMetadata;
  warnings?: ExtractWarning[];
}

export interface ExtractCacheMeta {
  contentHash: ContentHash;
  extractedAt: string;
  extractorId: string;
  extractorVersion: string;
  pluginVersion: string;
  referencedBy?: SourceId[];
}
