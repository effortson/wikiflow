import type { CachedExtract } from "@shared/types/cached-extract";
import type { TFile } from "obsidian";
import type { DocumentExtractor, ExtractContext } from "./types";
import { PdfTextExtractor } from "./pdf-text";
import { PdfVisionExtractor } from "./pdf-vision";
import { isEffectivelyEmpty } from "./helpers";
import type { PluginSettings } from "../../core/config/settings";

/**
 * Routes PDF extraction per §7.2:
 * - text layer when non-empty
 * - vision when empty + ocr auto|force
 * - empty_text warning when empty + ocr off
 */
export class PdfRoutingExtractor implements DocumentExtractor {
  readonly id = "pdf-router";
  readonly version = "1.0.0";
  readonly extensions = ["pdf"];

  readonly textExtractor = new PdfTextExtractor();
  readonly visionExtractor = new PdfVisionExtractor();

  supports(file: TFile): boolean {
    return file.extension.toLowerCase() === "pdf";
  }

  async extractToCache(
    file: TFile,
    ctx: ExtractContext,
  ): Promise<CachedExtract> {
    const ocr = resolveOcrMode(ctx);

    const textResult = await this.textExtractor.extractToCache(file, ctx);
    if (!isEffectivelyEmpty(textResult.fullText)) {
      return textResult;
    }

    if (ocr === "off") {
      return textResult;
    }

    return this.visionExtractor.extractToCache(file, ctx);
  }
}

function resolveOcrMode(ctx: ExtractContext): PluginSettings["defaultOcr"] {
  if (ctx.options.ocr) return ctx.options.ocr;
  return ctx.services.settings.defaultOcr;
}
