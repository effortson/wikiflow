import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { parseSnapshotZip } from "../src/core/backup/snapshot";
import type { BackupManifest } from "@shared/types/backup";

describe("backup snapshot", () => {
  it("parses zip with manifest and files", () => {
    const manifest: BackupManifest = {
      schemaVersion: 1,
      snapshotId: "20260101T000000Z",
      vaultName: "test",
      createdAt: new Date().toISOString(),
      pluginVersion: "0.1.0",
      scope: "enterpriseflow",
      includeExtractCache: false,
      fileCount: 1,
      totalBytes: 5,
      contentHash: "abc",
      excludes: [],
      files: [
        {
          path: "wiki/demo/a.md",
          size: 5,
          modifiedAt: "2026-01-01T00:00:00.000Z",
          contentHash: "hash",
        },
      ],
    };

    const zipBytes = zipSync({
      "manifest.json": strToU8(JSON.stringify(manifest)),
      "wiki/demo/a.md": strToU8("hello"),
    });

    const parsed = parseSnapshotZip(zipBytes);
    expect(parsed.manifest.snapshotId).toBe("20260101T000000Z");
    expect(parsed.files.get("wiki/demo/a.md")).toBeTruthy();
  });
});
