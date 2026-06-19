import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import type { TFile } from "obsidian";
import { XlsxSheetjsExtractor } from "../../src/wiki/extractors/xlsx-sheetjs";
import type { ExtractContext } from "../../src/wiki/extractors/types";
import type { CoreServices } from "../../src/core/core-services";

describe("XlsxSheetjsExtractor", () => {
  it("extracts sheets into chunks", async () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["Name", "Value"],
      ["Alpha", "1"],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    const data = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as number[];
    const arrayBuffer = new Uint8Array(data).buffer;

    const file = {
      path: "raw/legal/data.xlsx",
      basename: "data",
      extension: "xlsx",
    };

    const ctx: ExtractContext = {
      services: {
        vault: {
          getVault: () => ({
            readBinary: async () => arrayBuffer,
          }),
        },
        settings: { defaultOcr: "auto" },
      } as unknown as CoreServices,
      signal: new AbortController().signal,
      options: {},
      wikiId: "legal",
      sourceId: file.path,
      contentHash: "test-hash",
      pluginVersion: "0.1.0",
      language: "zh",
    };

    const extractor = new XlsxSheetjsExtractor();
    const cached = await extractor.extractToCache(file as unknown as TFile, ctx);

    expect(cached.metadata.extractorId).toBe("xlsx-sheetjs");
    expect(cached.chunks).toHaveLength(1);
    expect(cached.fullText).toContain("Sheet: Data");
    expect(cached.fullText).toContain("Alpha");
  });
});
