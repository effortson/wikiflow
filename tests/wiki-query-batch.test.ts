import { describe, expect, it, vi } from "vitest";
import { createBuiltinNodeRegistry } from "../src/workflow/registry/builtin-nodes";
import { createWorkflowContext } from "../src/workflow/runtime/context";
import { DEFAULT_SETTINGS } from "../src/core/config/settings";
import { MemoryVault } from "./helpers/memory-vault";

function createCtx(wikiQuery: (wikiId: string, question: string) => AsyncGenerator<unknown>) {
  return createWorkflowContext({
    runId: "run-1",
    rootRunId: "run-1",
    depth: 0,
    workflowId: "test",
    signal: new AbortController().signal,
    services: {
      llm: { chat: async () => "ok" } as never,
      wiki: { query: wikiQuery } as never,
      vault: new MemoryVault().asAdapter(),
      jobs: {} as never,
      backup: {} as never,
      workflow: {} as never,
    },
  });
}

describe("wiki.query-batch node", () => {
  it("queries each question in parallel and returns combined output in order", async () => {
    const calls: string[] = [];
    const ctx = createCtx(async function* (_wikiId, question) {
      calls.push(question);
      yield { kind: "done" as const, answer: `answer:${question}` };
    });

    const registry = createBuiltinNodeRegistry({
      getSettings: () => DEFAULT_SETTINGS,
      runSubworkflow: async () => ({}),
    });
    const node = registry.get("wiki.query-batch")!;

    const outputs = await node.execute(
      ctx,
      {
        wikiId: "demo",
        questions: "泄漏检测\n变频改造",
        maxQuestions: "5",
      },
      {},
    );

    expect(calls).toEqual(["泄漏检测", "变频改造"]);
    expect(outputs.answers).toEqual(["answer:泄漏检测", "answer:变频改造"]);
    expect(outputs.combined).toContain("### 1. 泄漏检测");
    expect(outputs.combined).toContain("answer:变频改造");
  });

  it("runs batch queries concurrently", async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    const ctx = createCtx(async function* (_wikiId, _question) {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 30));
      inFlight -= 1;
      yield { kind: "done" as const, answer: "ok" };
    });

    const registry = createBuiltinNodeRegistry({
      getSettings: () => DEFAULT_SETTINGS,
      runSubworkflow: async () => ({}),
    });
    const node = registry.get("wiki.query-batch")!;

    await node.execute(
      ctx,
      {
        wikiId: "demo",
        questions: "q1\nq2\nq3",
        maxQuestions: "5",
      },
      {},
    );

    expect(maxInFlight).toBeGreaterThan(1);
  });

  it("uses upstream text when questions field is omitted", async () => {
    const query = vi.fn(async function* () {
      yield { kind: "done" as const, answer: "ok" };
    });
    const ctx = createCtx(query);
    const registry = createBuiltinNodeRegistry({
      getSettings: () => DEFAULT_SETTINGS,
      runSubworkflow: async () => ({}),
    });
    const node = registry.get("wiki.query-batch")!;

    await node.execute(ctx, { wikiId: "demo" }, { text: "余热回收" });

    expect(query).toHaveBeenCalledWith("demo", "余热回收");
  });

  it("accepts llm output object on configured questions field", async () => {
    const calls: string[] = [];
    const ctx = createCtx(async function* (_wikiId, question) {
      calls.push(question);
      yield { kind: "done" as const, answer: "ok" };
    });
    const registry = createBuiltinNodeRegistry({
      getSettings: () => DEFAULT_SETTINGS,
      runSubworkflow: async () => ({}),
    });
    const node = registry.get("wiki.query-batch")!;

    await node.execute(
      ctx,
      {
        wikiId: "demo",
        questions: {
          text: "泄漏检测\n变频改造",
        },
      },
      {},
    );

    expect(calls).toEqual(["泄漏检测", "变频改造"]);
  });

  it("surfaces wiki query errors in answers", async () => {
    const ctx = createCtx(async function* () {
      yield { kind: "error" as const, message: "No wiki pages found" };
    });
    const registry = createBuiltinNodeRegistry({
      getSettings: () => DEFAULT_SETTINGS,
      runSubworkflow: async () => ({}),
    });
    const node = registry.get("wiki.query-batch")!;

    const outputs = await node.execute(
      ctx,
      { wikiId: "demo", questions: "泄漏检测" },
      {},
    );

    expect(outputs.answers).toEqual(["No wiki pages found"]);
    expect(outputs.combined).toContain("No wiki pages found");
  });

  it("requires at least one question", async () => {
    const ctx = createCtx(async function* () {
      yield { kind: "done" as const, answer: "x" };
    });
    const registry = createBuiltinNodeRegistry({
      getSettings: () => DEFAULT_SETTINGS,
      runSubworkflow: async () => ({}),
    });
    const node = registry.get("wiki.query-batch")!;

    await expect(
      node.execute(ctx, { wikiId: "demo", questions: "  \n  " }, {}),
    ).rejects.toThrow("at least one question");
  });
});
