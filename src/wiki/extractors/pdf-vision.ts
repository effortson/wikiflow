import type { CachedExtract } from "@shared/types/cached-extract";
import { sha256Hex } from "@shared/hash";
import { wikiLanguagePdfVisionPrompt } from "@shared/wiki-language";
import type { TFile } from "obsidian";
import type { DocumentExtractor, ExtractContext } from "./types";
import { makeCachedExtract } from "./helpers";
import { renderPdfPagesToPng } from "./pdf-text-core";

export class PdfVisionExtractor implements DocumentExtractor {
  readonly id = "pdf-vision";
  readonly version = "1.0.0";
  readonly extensions = ["pdf"];

  supports(file: TFile): boolean {
    return file.extension.toLowerCase() === "pdf";
  }

  async extractToCache(
    file: TFile,
    ctx: ExtractContext,
  ): Promise<CachedExtract> {
    if (ctx.signal.aborted) throw new Error("Extract cancelled");

    const bytes = await ctx.services.vault.getVault().readBinary(file);
    const contentHash = ctx.contentHash || (await sha256Hex(bytes));
    const maxPages = ctx.options.maxPages ?? 20;
    const visionModel = ctx.options.visionModel;

    const pages = await renderPdfPagesToPng(bytes, maxPages);
    const chunks: CachedExtract["chunks"] = [];
    const parts: string[] = [];

    for (const page of pages) {
      const text = await ctx.services.llm.vision({
        prompt: wikiLanguagePdfVisionPrompt(ctx.language),
        mimeType: "image/png",
        base64: page.base64,
        signal: ctx.signal,
        model: visionModel,
      });
      parts.push(text);
      chunks.push({
        id: `chunk-${String(page.page).padStart(3, "0")}`,
        text,
        locator: {
          kind: "pdf",
          page: page.page,
          pageCount: page.pageCount,
        },
        sequence: page.page,
      });
    }

    const fullText = parts.join("\n\n");

    return makeCachedExtract({
      contentHash,
      mimeType: "application/pdf",
      title: file.basename,
      language: ctx.language,
      fullText,
      chunks,
      metadata: {
        extractedAt: new Date().toISOString(),
        extractorId: this.id,
        extractorVersion: this.version,
        pluginVersion: ctx.pluginVersion,
        stats: {
          format: "pdf",
          pageCount: pages[0]?.pageCount ?? 0,
          ocrUsed: true,
        },
      },
    });
  }
}
