import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { sha256Hex } from "../src/shared/hash";
import { verifySnapshotIntegrity } from "../src/core/backup/snapshot";
import { sanitizeRestorePath } from "../src/core/backup/restore";
import { isWorkflowFalsy, isWorkflowTruthy } from "../src/shared/workflow-boolean";
import { sanitizeLlmMarkdown } from "../src/shared/sanitize-markdown";
import type { BackupManifest } from "@shared/types/backup";

describe("backup snapshot integrity", () => {
  it("verifySnapshotIntegrity checks zip and file hashes", async () => {
    const fileBytes = strToU8("hello");
    const fileHash = await sha256Hex(fileBytes);

    const manifestWithoutHash: BackupManifest = {
      schemaVersion: 1,
      snapshotId: "20260101T000000Z",
      vaultName: "test",
      createdAt: new Date().toISOString(),
      pluginVersion: "0.1.0",
      scope: "enterpriseflow",
      includeExtractCache: false,
      fileCount: 1,
      totalBytes: 5,
      contentHash: "",
      excludes: [],
      files: [
        {
          path: "wiki/demo/a.md",
          size: 5,
          modifiedAt: "2026-01-01T00:00:00.000Z",
          contentHash: fileHash,
        },
      ],
    };

    let zipBytes = zipSync({
      "manifest.json": strToU8(JSON.stringify(manifestWithoutHash, null, 2)),
      "wiki/demo/a.md": fileBytes,
    });
    const contentHash = await sha256Hex(zipBytes);
    const manifest: BackupManifest = { ...manifestWithoutHash, contentHash };
    zipBytes = zipSync({
      "manifest.json": strToU8(JSON.stringify(manifest, null, 2)),
      "wiki/demo/a.md": fileBytes,
    });

    await expect(verifySnapshotIntegrity(zipBytes)).resolves.toBeTruthy();
  });
});

describe("restore path sanitization", () => {
  it("rejects traversal paths", () => {
    expect(sanitizeRestorePath("../secret.md")).toBeNull();
    expect(sanitizeRestorePath("wiki/../etc/passwd")).toBeNull();
    expect(sanitizeRestorePath("wiki/demo/a.md")).toBe("wiki/demo/a.md");
  });
});

describe("workflow boolean coercion", () => {
  it("coerces UI string booleans", () => {
    expect(isWorkflowTruthy("true")).toBe(true);
    expect(isWorkflowTruthy("false")).toBe(false);
    expect(isWorkflowFalsy("false")).toBe(true);
    expect(isWorkflowFalsy(true)).toBe(false);
  });
});

describe("sanitize LLM markdown", () => {
  it("strips script tags", () => {
    const out = sanitizeLlmMarkdown('Hello <script>alert(1)</script> world');
    expect(out).not.toContain("<script");
  });
});
