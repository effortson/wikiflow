import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { sha256Hex } from "../src/shared/hash";
import {
  createSnapshotId,
  hashManifestContent,
  verifySnapshotIntegrity,
} from "../src/core/backup/snapshot";
import { sanitizeRestorePath } from "../src/core/backup/restore";
import { isWorkflowFalsy, isWorkflowTruthy } from "../src/shared/workflow-boolean";
import { sanitizeLlmMarkdown } from "../src/shared/sanitize-markdown";
import { matchGlob } from "../src/shared/glob";
import { evaluateBranchIf } from "../src/workflow/runtime/template";
import { mergeWikiPage } from "../src/wiki/engine/merge";
import { queryWikiAnswersBatch } from "../src/workflow/shared/query-wiki";
import { executeWorkflow } from "../src/workflow/runtime/executor";
import { createWorkflowContext } from "../src/workflow/runtime/context";
import { NodeRegistry } from "../src/workflow/registry/node-registry";
import {
  parseMarkdown,
  stringifyMarkdown,
  todayIsoDate,
} from "../src/shared/frontmatter";
import { parseLlmJson } from "../src/shared/parse-llm-json";
import { stripLlmNoise } from "../src/shared/strip-llm-noise";
import type { BackupManifest } from "@shared/types/backup";
import type { WorkflowDefinition } from "@shared/types/workflow";

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
      scope: "wikiflow",
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

    // contentHash is a deterministic digest of the manifest, not of the zip
    // bytes (which fflate stamps with a non-reproducible mtime).
    const contentHash = await hashManifestContent(manifestWithoutHash);
    const manifest: BackupManifest = { ...manifestWithoutHash, contentHash };
    // Build with manifest.json LAST — the order buildSnapshot uses — to prove
    // the integrity check no longer depends on zip entry order or mtime.
    const zipBytes = zipSync({
      "wiki/demo/a.md": fileBytes,
      "manifest.json": strToU8(JSON.stringify(manifest, null, 2)),
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

describe("snapshot id", () => {
  it("keeps millisecond precision so same-second snapshots don't collide", () => {
    const a = createSnapshotId(new Date("2026-01-01T00:00:00.500Z"));
    const b = createSnapshotId(new Date("2026-01-01T00:00:00.999Z"));
    expect(a).not.toBe(b);
  });
});

describe("glob top-level matching", () => {
  it("matches top-level paths with a **/ prefix", () => {
    expect(matchGlob(".DS_Store", "**/.DS_Store")).toBe(true);
    expect(matchGlob("notes/.DS_Store", "**/.DS_Store")).toBe(true);
    expect(matchGlob("a.md", "**/*.md")).toBe(true);
    expect(matchGlob("dir/a.md", "**/*.md")).toBe(true);
    expect(matchGlob("a.txt", "**/*.md")).toBe(false);
  });
});

describe("branch.if equality", () => {
  it("treats a templated number and a string literal as equal", () => {
    const vars = new Map<string, unknown>([["count", 5]]);
    expect(
      evaluateBranchIf({ left: "{{count}}", operator: "eq", right: "5" }, vars),
    ).toBe(true);
    expect(
      evaluateBranchIf({ left: "{{count}}", operator: "neq", right: "5" }, vars),
    ).toBe(false);
  });
});

describe("merge summary handling", () => {
  const baseFm = {
    type: "entity",
    wikiId: "legal",
    created: todayIsoDate(),
    updated: todayIsoDate(),
    sources: ["raw/legal/doc.txt"],
    tags: [],
    reviewed: false,
    aliases: [],
  };

  it("writes the summary once on a new page", () => {
    const result = mergeWikiPage({
      existingContent: null,
      incomingFrontmatter: baseFm,
      incomingBody: "\n# Acme\n",
      incomingMentionsBlock: "",
      incomingSummary: "Acme is a company.",
      mergePolicy: "merge",
    });
    const occurrences = result.content.split("Acme is a company.").length - 1;
    expect(occurrences).toBe(1);
  });

  it("does not stack summaries on re-ingest (fill-if-empty)", () => {
    const existing = stringifyMarkdown(baseFm, "\nOld summary.\n\nBody.\n");
    const result = mergeWikiPage({
      existingContent: existing,
      incomingFrontmatter: baseFm,
      incomingBody: "",
      incomingMentionsBlock: "",
      incomingSummary: "New summary",
      mergePolicy: "merge",
    });
    expect(result.content).toContain("Old summary.");
    expect(result.content).not.toContain("New summary");
  });
});

describe("frontmatter scalar parsing", () => {
  it("preserves zero-padded numeric strings", () => {
    const { frontmatter } = parseMarkdown("---\ncode: 007\n---\n\nbody\n");
    expect(frontmatter.code).toBe("007");
  });

  it("still coerces plain integers", () => {
    const { frontmatter } = parseMarkdown("---\ncount: 42\n---\n\nbody\n");
    expect(frontmatter.count).toBe(42);
  });
});

describe("parse-llm-json url handling", () => {
  it("parses repairable JSON whose string values contain // ", () => {
    const data = parseLlmJson<{ url: string }>(
      '{"url":"https://example.com/x",}',
    );
    expect(data.url).toBe("https://example.com/x");
  });
});

describe("strip-llm-noise", () => {
  it("does not truncate an answer that merely mentions <think>", () => {
    const out = stripLlmNoise("Use the <think> tag in HTML.");
    expect(out).toContain("tag in HTML");
  });
});

describe("wiki query batch cancellation", () => {
  it("propagates cancellation instead of returning it as an answer", async () => {
    const controller = new AbortController();
    controller.abort();
    const wiki = {
      query: async function* () {
        yield { kind: "text" as const, delta: "x" };
      },
    };

    await expect(
      queryWikiAnswersBatch(
        wiki as never,
        "demo",
        ["泄漏检测"],
        controller.signal,
      ),
    ).rejects.toThrow();
  });
});

describe("workflow branch reconvergence", () => {
  it("runs a merge node fed by both branch ports", async () => {
    const ran: string[] = [];
    const registry = new NodeRegistry();
    registry.register({
      type: "branch.if",
      label: "branch",
      inputs: {},
      outputs: {},
      execute: async (_ctx, config) => ({ result: config.result === true }),
    });
    registry.register({
      type: "test.echo",
      label: "echo",
      inputs: {},
      outputs: {},
      execute: async (_ctx, config) => {
        ran.push(config.tag as string);
        return { tag: config.tag };
      },
    });

    const node = (id: string, type: string, data: Record<string, unknown>) => ({
      id,
      type,
      position: { x: 0, y: 0 },
      data,
    });
    const def: WorkflowDefinition = {
      schemaVersion: 1,
      id: "diamond",
      name: "Diamond",
      nodes: [
        node("B", "branch.if", { result: true }),
        node("T", "test.echo", { tag: "T" }),
        node("F", "test.echo", { tag: "F" }),
        node("M", "test.echo", { tag: "M" }),
      ],
      edges: [
        { id: "e1", from: "B", to: "T", fromPort: "true" },
        { id: "e2", from: "B", to: "F", fromPort: "false" },
        { id: "e3", from: "T", to: "M" },
        { id: "e4", from: "F", to: "M" },
      ],
    };

    const ctx = createWorkflowContext({
      runId: "r1",
      rootRunId: "r1",
      depth: 0,
      workflowId: "diamond",
      signal: new AbortController().signal,
      services: {} as never,
    });

    await executeWorkflow(def, ctx, registry);

    // The merge node must run on the taken path (previously it was silently
    // dropped). The untaken branch is correctly skipped.
    expect(ran).toContain("T");
    expect(ran).toContain("M");
    expect(ran).not.toContain("F");
  });
});
