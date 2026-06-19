import fs from "fs";
import path from "path";
import { describe, expect, it, vi } from "vitest";
import { EventBus } from "../src/core/events/event-bus";
import { JobQueue } from "../src/core/jobs/job-queue";
import { Logger } from "../src/core/log/logger";
import { StubBackupService } from "../src/core/backup/backup-service.stub";
import { DEFAULT_SETTINGS } from "../src/core/config/settings";
import type { IngestReport } from "@shared/types/ingest-report";
import type { NormalizedDocument } from "@shared/types/normalized-document";
import type { WikiService } from "../src/wiki/service";
import { MemoryVault } from "./helpers/memory-vault";
import { EnterpriseWorkflowService } from "../src/workflow/workflow-service";
import type { WorkflowDefinition } from "@shared/types/workflow";

const fixturesDir = path.join(process.cwd(), "tests/fixtures/workflows");

function loadFixture(name: string): WorkflowDefinition {
  return JSON.parse(
    fs.readFileSync(path.join(fixturesDir, name), "utf8"),
  ) as WorkflowDefinition;
}

function createMockWiki(): WikiService {
  const sampleDoc = {
    schemaVersion: 1 as const,
    wikiId: "legal",
    sourceId: "raw/legal/sample.txt",
    contentHash: "abc",
    title: "Sample",
    mimeType: "text/plain",
    fullText: "sample",
    chunks: [],
    metadata: {
      extractorId: "text-plain",
      extractorVersion: "1",
      mimeType: "text/plain",
      extractedAt: new Date().toISOString(),
      pluginVersion: "0.1.0",
      stats: { format: "plain" as const },
    },
  } as unknown as NormalizedDocument;

  const report: IngestReport = {
    wikiId: "legal",
    sourceId: "raw/legal/sample.txt",
    status: "completed",
    createdPages: ["wiki/legal/sources/sample.md"],
    updatedPages: [],
    skippedPages: [],
    errors: [],
    durationMs: 1,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  };

  return {
    listWikis: async () => [],
    extract: vi.fn(async () => sampleDoc),
    ingest: vi.fn(async () => report),
    ingestFile: vi.fn(async () => report),
    ingestWiki: vi.fn(async () => report),
    query: async function* () {
      yield { kind: "text" as const, delta: "answer" };
    },
    lint: vi.fn(),
    regenerateIndex: vi.fn(),
    finalizeWikiIngest: vi.fn(),
    extractRawToSource: vi.fn(),
    extractRawFile: vi.fn(),
    generateSchema: vi.fn(),
  };
}

function createTestWorkflowService(wiki: WikiService) {
  const mem = new MemoryVault();
  mem.write("raw/legal/sample.txt", "sample content");
  for (const name of fs.readdirSync(fixturesDir)) {
    if (!name.endsWith(".workflow.json")) continue;
    mem.write(
      `tests/fixtures/workflows/${name}`,
      fs.readFileSync(path.join(fixturesDir, name), "utf8"),
    );
  }

  const vault = mem.asAdapter();
  const settings = {
    ...DEFAULT_SETTINGS,
    maxWorkflowNestingDepth: 2,
    maxConcurrentWorkflowRuns: 2,
  };

  const core = {
    llm: {
      chat: vi.fn(
        (opts?: { signal?: AbortSignal }) =>
          new Promise<string>((resolve, reject) => {
            const timer = setTimeout(
              () => resolve("Ingest completed successfully."),
              500,
            );
            opts?.signal?.addEventListener("abort", () => {
              clearTimeout(timer);
              reject(new Error("LLM request cancelled"));
            });
          }),
      ),
      vision: vi.fn(),
    },
    jobs: new JobQueue(),
    dedup: { runIngest: (_w: string, _s: string, fn: () => Promise<unknown>) => fn(), runExtract: (_h: string, fn: () => Promise<unknown>) => fn() },
    vault,
    cache: {} as never,
    backup: new StubBackupService(),
    events: new EventBus(),
    settings,
    logger: new Logger(() => settings),
  };

  const service = new EnterpriseWorkflowService({
    core: core as never,
    wiki,
    getSettings: () => settings,
    notice: vi.fn(),
  });

  return { service, core, mem, wiki, settings };
}

describe("workflow executor", () => {
  it("runs ingest-and-summarize with subworkflow", async () => {
    const wiki = createMockWiki();
    const { service } = createTestWorkflowService(wiki);
    const def = loadFixture("ingest-and-summarize.workflow.json");

    const report = await service.run(def, {
      path: "raw/legal/sample.txt",
      wikiId: "legal",
    });

    expect(report.status).toBe("completed");
    expect(wiki.extract).toHaveBeenCalled();
    expect(wiki.ingest).toHaveBeenCalled();
    expect(report.childRuns?.length ?? 0).toBeGreaterThan(0);
  });

  it("rejects subworkflow depth above maxWorkflowNestingDepth", async () => {
    const wiki = createMockWiki();
    const { service, settings } = createTestWorkflowService(wiki);
    settings.maxWorkflowNestingDepth = 0;

    const def = loadFixture("ingest-and-summarize.workflow.json");
    const report = await service.run(def, {
      path: "raw/legal/sample.txt",
      wikiId: "legal",
    });

    expect(report.status).toBe("failed");
    expect(report.error).toContain("maxWorkflowNestingDepth");
  });

  it("cancels root run recursively", async () => {
    const wiki = createMockWiki();
    const { service } = createTestWorkflowService(wiki);

    const def = loadFixture("ingest-and-summarize.workflow.json");
    const runPromise = service.run(def, {
      path: "raw/legal/sample.txt",
      wikiId: "legal",
    });

    await new Promise((r) => setTimeout(r, 50));
    const runIds = service.listActiveRunIds();
    expect(runIds[0] ? service.cancel(runIds[0]) : false).toBe(true);

    const report = await runPromise;
    expect(report.status).toBe("cancelled");
  });

  it("fails wiki.ingest without wikiId in node data", async () => {
    const wiki = createMockWiki();
    const { service } = createTestWorkflowService(wiki);

    const def: WorkflowDefinition = {
      schemaVersion: 1,
      id: "no-wiki",
      name: "No wiki",
      nodes: [
        {
          id: "ingest",
          type: "wiki.ingest",
          position: { x: 100, y: 0 },
          data: {},
        },
      ],
      edges: [],
    };

    const validation = await service.validate(def);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.message.includes("wikiId"))).toBe(
      true,
    );
  });
});
