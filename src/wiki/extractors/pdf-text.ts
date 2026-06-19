import type { CachedExtract } from "@shared/types/cached-extract";
import { sha256Hex } from "@shared/hash";
import type { TFile } from "obsidian";
import type { DocumentExtractor, ExtractContext } from "./types";
import { emptyTextWarning, isEffectivelyEmpty, makeCachedExtract } from "./helpers";
import { extractPdfText } from "./pdf-text-core";

export class PdfTextExtractor implements DocumentExtractor {
  readonly id = "pdf-text";
  readonly version = "1.1.0";
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
    const maxPages = ctx.options.maxPages ?? 200;

    const { fullText, chunks, pageCount, ocrUsed, tableCount } =
      await extractPdfText(bytes, maxPages);

    const warnings = isEffectivelyEmpty(fullText) ? [emptyTextWarning()] : undefined;

    return makeCachedExtract({
      contentHash,
      mimeType: "application/pdf",
      title: file.basename,
      fullText,
      chunks,
      metadata: {
        extractedAt: new Date().toISOString(),
        extractorId: this.id,
        extractorVersion: this.version,
        pluginVersion: ctx.pluginVersion,
        stats: { format: "pdf", pageCount, ocrUsed, tableCount },
      },
      warnings,
    });
  }
}
