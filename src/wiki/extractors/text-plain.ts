import type { CachedExtract } from "@shared/types/cached-extract";
import { sha256Hex } from "@shared/hash";
import type { TFile } from "obsidian";
import type { DocumentExtractor, ExtractContext } from "./types";

const PLAIN_EXTENSIONS = new Set(["txt", "md", "csv"]);

export class TextPlainExtractor implements DocumentExtractor {
  readonly id = "text-plain";
  readonly version = "1.0.0";
  readonly extensions = [...PLAIN_EXTENSIONS];

  supports(file: TFile): boolean {
    const ext = file.extension.toLowerCase();
    return PLAIN_EXTENSIONS.has(ext);
  }

  async extractToCache(
    file: TFile,
    ctx: ExtractContext,
  ): Promise<CachedExtract> {
    if (ctx.signal.aborted) throw new Error("Extract cancelled");

    const bytes = await ctx.services.vault.getVault().readBinary(file);
    const contentHash = ctx.contentHash || (await sha256Hex(bytes));
    const fullText = new TextDecoder("utf-8").decode(bytes);
    const title = file.basename;
    const chunks = buildChunks(fullText, title);

    const mimeType =
      file.extension === "csv"
        ? "text/csv"
        : file.extension === "md"
          ? "text/markdown"
          : "text/plain";

    return {
      schemaVersion: 1,
      contentHash,
      mimeType,
      title,
      fullText,
      chunks,
      metadata: {
        extractedAt: new Date().toISOString(),
        extractorId: this.id,
        extractorVersion: this.version,
        pluginVersion: ctx.pluginVersion,
        stats: { format: "plain" },
      },
    };
  }
}

function buildChunks(
  fullText: string,
  title: string,
): CachedExtract["chunks"] {
  if (!fullText.trim()) {
    return [
      {
        id: "chunk-001",
        text: "",
        locator: { kind: "plain", label: title },
        sequence: 1,
        charOffset: 0,
      },
    ];
  }

  const paragraphs = fullText.split(/\n{2,}/);
  let offset = 0;
  return paragraphs.map((text, i) => {
    const chunk = {
      id: `chunk-${String(i + 1).padStart(3, "0")}`,
      text: text.trim(),
      locator: { kind: "plain" as const, label: `§${i + 1}` },
      sequence: i + 1,
      charOffset: offset,
    };
    offset += text.length + 2;
    return chunk;
  });
}
