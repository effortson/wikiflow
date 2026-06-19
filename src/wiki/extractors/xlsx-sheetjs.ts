import * as XLSX from "xlsx";
import type { CachedExtract } from "@shared/types/cached-extract";
import { sha256Hex } from "@shared/hash";
import type { TFile } from "obsidian";
import type { DocumentExtractor, ExtractContext } from "./types";
import type { ExtractWarning } from "@shared/types/normalized-document";
import { emptyTextWarning, isEffectivelyEmpty, makeCachedExtract } from "./helpers";

const MAX_XLSX_BYTES = 20 * 1024 * 1024;
const MAX_XLSX_ROWS = 50_000;

export class XlsxSheetjsExtractor implements DocumentExtractor {
  readonly id = "xlsx-sheetjs";
  readonly version = "1.0.0";
  readonly extensions = ["xlsx", "xls"];

  supports(file: TFile): boolean {
    const ext = file.extension.toLowerCase();
    return ext === "xlsx" || ext === "xls";
  }

  async extractToCache(
    file: TFile,
    ctx: ExtractContext,
  ): Promise<CachedExtract> {
    if (ctx.signal.aborted) throw new Error("Extract cancelled");

    const bytes = await ctx.services.vault.getVault().readBinary(file);
    if (bytes.byteLength > MAX_XLSX_BYTES) {
      throw new Error(
        `Spreadsheet exceeds size limit (${MAX_XLSX_BYTES} bytes): ${file.path}`,
      );
    }
    const contentHash = ctx.contentHash || (await sha256Hex(bytes));
    const workbook = XLSX.read(bytes, { type: "array" });

    const sheetNames =
      ctx.options.sheetFilter?.length
        ? workbook.SheetNames.filter((n) =>
            ctx.options.sheetFilter!.includes(n),
          )
        : workbook.SheetNames;

    const chunks: CachedExtract["chunks"] = [];
    const mdParts: string[] = [];
    let sequence = 0;
    let rowCount = 0;

    for (const sheet of sheetNames) {
      const ws = workbook.Sheets[sheet];
      if (!ws) continue;
      const csv = XLSX.utils.sheet_to_csv(ws);
      const rows = csv.split("\n").filter((l) => l.trim());
      rowCount += rows.length;
      sequence++;
      const text = `## Sheet: ${sheet}\n\n${csv}`;
      mdParts.push(text);
      chunks.push({
        id: `chunk-${String(sequence).padStart(3, "0")}`,
        text,
        locator: { kind: "xlsx", sheet, range: ws["!ref"] },
        sequence,
      });
    }

    const fullText = mdParts.join("\n\n");
    const warnings: ExtractWarning[] = isEffectivelyEmpty(fullText)
      ? [emptyTextWarning()]
      : [];
    if (rowCount > MAX_XLSX_ROWS) {
      warnings.push({
        code: "truncated",
        message: `Spreadsheet truncated: ${rowCount} rows exceeds limit of ${MAX_XLSX_ROWS}`,
      });
    }

    return makeCachedExtract({
      contentHash,
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      title: file.basename,
      fullText,
      chunks,
      metadata: {
        extractedAt: new Date().toISOString(),
        extractorId: this.id,
        extractorVersion: this.version,
        pluginVersion: ctx.pluginVersion,
        stats: { format: "xlsx", sheetNames, rowCount },
      },
      warnings,
    });
  }
}
