import { describe, expect, it } from "vitest";
import {
  snapshotWorkflowRecord,
  snapshotWorkflowValue,
} from "../src/shared/workflow-step-snapshot";

describe("workflow-step-snapshot", () => {
  it("summarizes TFile-like objects", () => {
    const value = snapshotWorkflowValue({
      path: "source/demo/a.md",
      basename: "a",
      extension: "md",
    });
    expect(value).toEqual({
      __type: "TFile",
      path: "source/demo/a.md",
      name: "a",
      extension: "md",
    });
  });

  it("truncates long strings", () => {
    const value = snapshotWorkflowValue("x".repeat(5000)) as string;
    expect(value).toContain("5000 chars");
    expect(value.length).toBeLessThan(5000);
  });

  it("snapshots records for inspector display", () => {
    const record = snapshotWorkflowRecord({
      wikiId: "demo",
      count: 2,
    });
    expect(record).toEqual({ wikiId: "demo", count: 2 });
  });
});
