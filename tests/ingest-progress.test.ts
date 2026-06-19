import { describe, expect, it } from "vitest";
import { formatIngestProgress } from "../src/ui/ingest-progress";

describe("formatIngestProgress", () => {
  it("formats single-file extracting step in Chinese", () => {
    const text = formatIngestProgress(
      {
        wikiId: "legal",
        sourceId: "raw/legal/report.pdf",
        fileName: "report",
        phase: "extracting",
      },
      "zh-CN",
    );
    expect(text).toContain("report");
    expect(text).toContain("提取内容");
  });

  it("formats wiki batch progress with index", () => {
    const text = formatIngestProgress(
      {
        wikiId: "legal",
        sourceId: "raw/legal/a.pdf",
        fileName: "a",
        phase: "analyzing",
        fileIndex: 2,
        fileTotal: 5,
      },
      "zh-CN",
    );
    expect(text).toBe("2/5 · LLM 分析 · a");
  });

  it("formats wiki preparing step", () => {
    const text = formatIngestProgress(
      {
        wikiId: "国标",
        phase: "wiki_preparing",
        fileTotal: 12,
      },
      "zh-CN",
    );
    expect(text).toContain("国标");
    expect(text).toContain("12");
  });
});
