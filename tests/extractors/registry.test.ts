import { describe, expect, it } from "vitest";
import { ExtractorRegistry } from "../../src/wiki/extractors/registry";
import { makeCachedExtract } from "../../src/wiki/extractors/helpers";

describe("ExtractorRegistry.isCacheValid", () => {
  it("invalidates when extractor version changes", () => {
    const registry = new ExtractorRegistry();
    const cached = makeCachedExtract({
      contentHash: "abc",
      mimeType: "text/plain",
      title: "t",
      fullText: "hi",
      chunks: [],
      metadata: {
        extractedAt: new Date().toISOString(),
        extractorId: "text-plain",
        extractorVersion: "0.0.1",
        pluginVersion: "0.1.0",
        stats: { format: "plain" },
      },
    });
    expect(registry.isCacheValid(cached)).toBe(false);
  });

  it("accepts matching producer version", () => {
    const registry = new ExtractorRegistry();
    const cached = makeCachedExtract({
      contentHash: "abc",
      mimeType: "text/plain",
      title: "t",
      fullText: "hi",
      chunks: [],
      metadata: {
        extractedAt: new Date().toISOString(),
        extractorId: "text-plain",
        extractorVersion: "1.0.0",
        pluginVersion: "0.1.0",
        stats: { format: "plain" },
      },
    });
    expect(registry.isCacheValid(cached)).toBe(true);
  });

  it("invalidates OCR cache when language changes", () => {
    const registry = new ExtractorRegistry();
    const cached = makeCachedExtract({
      contentHash: "abc",
      mimeType: "application/pdf",
      title: "t",
      language: "en",
      fullText: "hi",
      chunks: [],
      metadata: {
        extractedAt: new Date().toISOString(),
        extractorId: "pdf-vision",
        extractorVersion: "1.0.0",
        pluginVersion: "0.1.0",
        stats: { format: "pdf", pageCount: 1, ocrUsed: true },
      },
    });
    expect(registry.isCacheValid(cached, "zh")).toBe(false);
    expect(registry.isCacheValid(cached, "en")).toBe(true);
  });
});
