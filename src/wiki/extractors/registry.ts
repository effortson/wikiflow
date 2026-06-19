import type { CachedExtract } from "@shared/types/cached-extract";
import type { TFile } from "obsidian";
import { normalizeWikiLanguage, type WikiLanguage } from "@shared/wiki-language";
import type { DocumentExtractor } from "./types";
import { TextPlainExtractor } from "./text-plain";
import { DocxMammothExtractor } from "./docx-mammoth";
import { XlsxSheetjsExtractor } from "./xlsx-sheetjs";
import { PdfRoutingExtractor } from "./pdf-router";
import { ImageVisionExtractor } from "./image-vision";

export class ExtractorRegistry {
  private extractors: DocumentExtractor[];
  private readonly pdfRouter: PdfRoutingExtractor;

  constructor(extractors?: DocumentExtractor[]) {
    this.pdfRouter = new PdfRoutingExtractor();
    this.extractors = extractors ?? createDefaultExtractors(this.pdfRouter);
  }

  route(file: TFile): DocumentExtractor {
    for (const ext of this.extractors) {
      if (ext.supports(file)) return ext;
    }
    throw new Error(`No extractor for file: ${file.path}`);
  }

  list(): DocumentExtractor[] {
    return [...this.extractors];
  }

  isCacheValid(cached: CachedExtract, language: WikiLanguage = "zh"): boolean {
    if (cached.schemaVersion !== 1) return false;
    const producer = this.findProducer(cached.metadata.extractorId);
    if (!producer) return false;
    if (producer.version !== cached.metadata.extractorVersion) return false;
    if (
      cached.metadata.stats &&
      "ocrUsed" in cached.metadata.stats &&
      cached.metadata.stats.ocrUsed
    ) {
      return normalizeWikiLanguage(cached.language) === language;
    }
    return true;
  }

  findProducer(extractorId: string): DocumentExtractor | undefined {
    for (const ext of this.extractors) {
      if (ext.id === extractorId) return ext;
    }
    if (extractorId === "pdf-text") return this.pdfRouter.textExtractor;
    if (extractorId === "pdf-vision") return this.pdfRouter.visionExtractor;
    return undefined;
  }
}

export function createDefaultExtractors(
  pdfRouter: PdfRoutingExtractor = new PdfRoutingExtractor(),
): DocumentExtractor[] {
  return [
    new TextPlainExtractor(),
    new DocxMammothExtractor(),
    new XlsxSheetjsExtractor(),
    pdfRouter,
    new ImageVisionExtractor(),
  ];
}

export function createDefaultRegistry(): ExtractorRegistry {
  return new ExtractorRegistry();
}
