import type { WikiId } from "./wiki-instance";

export type SourceId = string;
export type ContentHash = string;

export type SourceLocator =
  | PdfLocator
  | DocxLocator
  | XlsxLocator
  | ImageLocator
  | PlainLocator;

export interface PdfLocator {
  kind: "pdf";
  page: number;
  pageCount: number;
}

export interface DocxLocator {
  kind: "docx";
  section?: string;
  paragraphIndex?: number;
}

export interface XlsxLocator {
  kind: "xlsx";
  sheet: string;
  range?: string;
  row?: number;
  col?: number;
}

export interface ImageLocator {
  kind: "image";
  width?: number;
  height?: number;
  region?: { x: number; y: number; w: number; h: number };
}

export interface PlainLocator {
  kind: "plain";
  label?: string;
}

export interface DocumentChunk {
  id: string;
  text: string;
  locator: SourceLocator;
  sequence: number;
  charOffset?: number;
  textHash?: string;
}

export type ExtractStats =
  | { format: "pdf"; pageCount: number; ocrUsed: boolean; tableCount?: number }
  | { format: "docx"; paragraphCount?: number }
  | { format: "xlsx"; sheetNames: string[]; rowCount?: number }
  | { format: "image"; ocrUsed: boolean; visionModel?: string }
  | { format: "plain" };

export interface ExtractMetadata {
  extractedAt: string;
  extractorId: string;
  extractorVersion: string;
  pluginVersion: string;
  stats: ExtractStats;
}

export interface ExtractWarning {
  code:
    | "truncated"
    | "ocr_low_confidence"
    | "empty_text"
    | "password_protected"
    | "unsupported_feature";
  message: string;
  locator?: SourceLocator;
}

export interface NormalizedDocument {
  schemaVersion: 1;
  wikiId: WikiId;
  sourceId: SourceId;
  contentHash: ContentHash;
  mimeType: string;
  title: string;
  language?: string;
  fullText: string;
  chunks: DocumentChunk[];
  metadata: ExtractMetadata;
  warnings?: ExtractWarning[];
}

export interface IngestProgressContext {
  fileIndex?: number;
  fileTotal?: number;
}

export interface ExtractOptions {
  wikiId?: WikiId;
  ocr?: "off" | "auto" | "force";
  visionModel?: string;
  maxPages?: number;
  sheetFilter?: string[];
  progress?: IngestProgressContext;
}
