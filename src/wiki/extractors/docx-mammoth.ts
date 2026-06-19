import mammoth from "mammoth";
import type { CachedExtract } from "@shared/types/cached-extract";
import type { TFile } from "obsidian";
import type { DocumentExtractor, ExtractContext } from "./types";
import { makeCachedExtract } from "./helpers";
import { sha256Hex } from "@shared/hash";

export class DocxMammothExtractor implements DocumentExtractor {
  readonly id = "docx-mammoth";
  readonly version = "1.0.0";
  readonly extensions = ["docx"];

  supports(file: TFile): boolean {
    return file.extension.toLowerCase() === "docx";
  }

  async extractToCache(
    file: TFile,
    ctx: ExtractContext,
  ): Promise<CachedExtract> {
    if (ctx.signal.aborted) throw new Error("Extract cancelled");

    const bytes = await ctx.services.vault.getVault().readBinary(file);
    const contentHash = ctx.contentHash || (await sha256Hex(bytes));
    const result = await (
      mammoth as unknown as {
        convertToMarkdown: (input: {
          arrayBuffer: ArrayBuffer;
        }) => Promise<{
          value: string;
          messages: { message: string }[];
        }>;
      }
    ).convertToMarkdown({
      arrayBuffer: bytes,
    });

    const fullText = result.value.trim();
    const paragraphs = fullText.split(/\n{2,}/).filter(Boolean);
    const chunks =
      paragraphs.length > 0
        ? paragraphs.map((text, i) => ({
            id: `chunk-${String(i + 1).padStart(3, "0")}`,
            text,
            locator: {
              kind: "docx" as const,
              section: `§${i + 1}`,
              paragraphIndex: i + 1,
            },
            sequence: i + 1,
          }))
        : [
            {
              id: "chunk-001",
              text: "",
              locator: { kind: "docx" as const },
              sequence: 1,
            },
          ];

    return makeCachedExtract({
      contentHash,
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      title: file.basename,
      fullText: fullText || "",
      chunks,
      metadata: {
        extractedAt: new Date().toISOString(),
        extractorId: this.id,
        extractorVersion: this.version,
        pluginVersion: ctx.pluginVersion,
        stats: { format: "docx", paragraphCount: paragraphs.length },
      },
      warnings: result.messages.length
        ? [
            {
              code: "unsupported_feature",
              message: result.messages.map((m) => m.message).join("; "),
            },
          ]
        : undefined,
    });
  }
}
