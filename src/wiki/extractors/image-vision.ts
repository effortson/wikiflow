import type { CachedExtract } from "@shared/types/cached-extract";
import { sha256Hex } from "@shared/hash";
import { wikiLanguageImageVisionPrompt } from "@shared/wiki-language";
import type { TFile } from "obsidian";
import type { DocumentExtractor, ExtractContext } from "./types";
import { emptyTextWarning, isEffectivelyEmpty, makeCachedExtract } from "./helpers";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export class ImageVisionExtractor implements DocumentExtractor {
  readonly id = "image-vision";
  readonly version = "1.0.0";
  readonly extensions = [...IMAGE_EXTENSIONS];

  supports(file: TFile): boolean {
    return IMAGE_EXTENSIONS.has(file.extension.toLowerCase());
  }

  async extractToCache(
    file: TFile,
    ctx: ExtractContext,
  ): Promise<CachedExtract> {
    if (ctx.signal.aborted) throw new Error("Extract cancelled");

    const bytes = await ctx.services.vault.getVault().readBinary(file);
    const contentHash = ctx.contentHash || (await sha256Hex(bytes));
    const ext = file.extension.toLowerCase();
    const mimeType = MIME[ext] ?? "image/png";
    const base64 = arrayBufferToBase64(bytes);

    const text = await ctx.services.llm.vision({
      prompt: wikiLanguageImageVisionPrompt(ctx.language),
      mimeType,
      base64,
      signal: ctx.signal,
      model: ctx.options.visionModel,
    });

    const fullText = text.trim();
    const warnings = isEffectivelyEmpty(fullText) ? [emptyTextWarning()] : undefined;

    return makeCachedExtract({
      contentHash,
      mimeType,
      title: file.basename,
      language: ctx.language,
      fullText,
      chunks: [
        {
          id: "chunk-001",
          text: fullText,
          locator: { kind: "image" },
          sequence: 1,
        },
      ],
      metadata: {
        extractedAt: new Date().toISOString(),
        extractorId: this.id,
        extractorVersion: this.version,
        pluginVersion: ctx.pluginVersion,
        stats: {
          format: "image",
          ocrUsed: true,
          visionModel: ctx.options.visionModel ?? ctx.services.settings.model,
        },
      },
      warnings,
    });
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
