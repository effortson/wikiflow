import { describe, expect, it } from "vitest";
import { createBuiltinNodeRegistry } from "../src/workflow/registry/builtin-nodes";
import { createWorkflowContext } from "../src/workflow/runtime/context";
import { DEFAULT_SETTINGS } from "../src/core/config/settings";
import { MemoryVault } from "./helpers/memory-vault";

function createCtx(vault = new MemoryVault()) {
  return createWorkflowContext({
    runId: "run-1",
    rootRunId: "run-1",
    depth: 0,
    workflowId: "test",
    signal: new AbortController().signal,
    services: {
      llm: { chat: async () => "ok" } as never,
      wiki: {} as never,
      vault: vault.asAdapter(),
      jobs: {} as never,
      backup: {} as never,
      workflow: {} as never,
    },
  });
}

describe("builtin user-input and output.text nodes", () => {
  it("trigger.user-input returns run input text", async () => {
    const registry = createBuiltinNodeRegistry({
      getSettings: () => DEFAULT_SETTINGS,
      runSubworkflow: async () => ({}),
    });
    const node = registry.get("trigger.user-input")!;
    const outputs = await node.execute(
      createCtx(),
      { prompt: "请输入你的问题" },
      { text: "如何降低压缩空气站能耗" },
    );
    expect(outputs.text).toBe("如何降低压缩空气站能耗");
    expect(outputs.input).toBe("如何降低压缩空气站能耗");
  });

  it("trigger.user-input requires non-empty run input", async () => {
    const registry = createBuiltinNodeRegistry({
      getSettings: () => DEFAULT_SETTINGS,
      runSubworkflow: async () => ({}),
    });
    const node = registry.get("trigger.user-input")!;

    await expect(
      node.execute(createCtx(), { prompt: "请输入你的问题" }, {}),
    ).rejects.toThrow("requires text in run inputs");
  });

  it("output.text resolves template and writes optional path", async () => {
    const vault = new MemoryVault();
    const ctx = createCtx(vault);
    ctx.variables.set("summary", "Done");
    const registry = createBuiltinNodeRegistry({
      getSettings: () => DEFAULT_SETTINGS,
      runSubworkflow: async () => ({}),
    });
    const node = registry.get("output.text")!;
    const outputs = await node.execute(
      ctx,
      { text: "{{summary}}", path: "output/result.md" },
      {},
    );
    expect(outputs.text).toBe("Done");
    expect(vault.read("output/result.md")).toBe("Done");
  });
});
