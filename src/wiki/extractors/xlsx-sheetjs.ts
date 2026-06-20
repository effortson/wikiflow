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
    let truncated = false;

    for (const sheet of sheetNames) {
      const ws = workbook.Sheets[sheet];
      if (!ws) continue;
      if (rowCount >= MAX_XLSX_ROWS) {
        truncated = true;
        break;
      }
      const csv = XLSX.utils.sheet_to_csv(ws);
      let rows = csv.split("\n").filter((l) => l.trim());
      if (rowCount + rows.length > MAX_XLSX_ROWS) {
        rows = rows.slice(0, MAX_XLSX_ROWS - rowCount);
        truncated = true;
      }
      rowCount += rows.length;
      sequence++;
      const text = `## Sheet: ${sheet}\n\n${rows.join("\n")}`;
      mdParts.push(text);
      chunks.push({
        id: `chunk-${String(sequence).padStart(3, "0")}`,
        text,
        locator: { kind: "xlsx", sheet, range: ws["!ref"] },
        sequence,
      });
      if (truncated) break;
    }

    const fullText = mdParts.join("\n\n");
    const warnings: ExtractWarning[] = isEffectivelyEmpty(fullText)
      ? [emptyTextWarning()]
      : [];
    if (truncated) {
      warnings.push({
        code: "truncated",
        message: `Spreadsheet truncated to ${MAX_XLSX_ROWS} rows`,
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
