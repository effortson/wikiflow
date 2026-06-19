import { bindExtractContext } from "@shared/bind-extract-context";
import type { CachedExtract } from "@shared/types/cached-extract";
import { describe, expect, it } from "vitest";

const baseExtract: CachedExtract = {
  schemaVersion: 1,
  contentHash: "abc123",
  mimeType: "text/plain",
  title: "Cached Title",
  fullText: "hello",
  chunks: [],
  metadata: {
    extractedAt: "2026-06-18T00:00:00.000Z",
    extractorId: "text-plain",
    extractorVersion: "1.0.0",
    pluginVersion: "0.1.0",
    stats: { format: "plain" },
  },
};

describe("bindExtractContext", () => {
  it("uses ctx.title when provided", () => {
    const doc = bindExtractContext(baseExtract, {
      wikiId: "legal",
      sourceId: "raw/legal/contracts/report.pdf",
      title: "Explicit Title",
    });
    expect(doc.title).toBe("Explicit Title");
    expect(doc.wikiId).toBe("legal");
    expect(doc.sourceId).toBe("raw/legal/contracts/report.pdf");
  });

  it("falls back to sourceId basename without extension", () => {
    const doc = bindExtractContext(baseExtract, {
      wikiId: "legal",
      sourceId: "raw/legal/contracts/report-q1.pdf",
    });
    expect(doc.title).toBe("report-q1");
  });

  it("falls back to cached.title when sourceId has no basename", () => {
    const doc = bindExtractContext(baseExtract, {
      wikiId: "legal",
      sourceId: "raw/legal/",
    });
    expect(doc.title).toBe("Cached Title");
  });
});
