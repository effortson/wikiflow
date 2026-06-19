import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { createBuiltinNodeRegistry } from "../src/workflow/registry/builtin-nodes";
import { NodeRegistry } from "../src/workflow/registry/node-registry";
import { validateWorkflow } from "../src/workflow/schema/validator";
import type { WorkflowDefinition } from "@shared/types/workflow";
import { DEFAULT_SETTINGS } from "../src/core/config/settings";

const fixturesDir = path.join(
  process.cwd(),
  "tests/fixtures/workflows",
);

function loadFixture(name: string): WorkflowDefinition {
  const raw = fs.readFileSync(path.join(fixturesDir, name), "utf8");
  return JSON.parse(raw) as WorkflowDefinition;
}

function makeValidatorDeps(
  workflows: Record<string, WorkflowDefinition>,
) {
  const registry = createBuiltinNodeRegistry({
    getSettings: () => DEFAULT_SETTINGS,
    runSubworkflow: async () => ({}),
  });

  return {
    registry,
    listWorkflows: async () =>
      Object.entries(workflows).map(([file, def]) => ({
        path: `tests/fixtures/workflows/${file}`,
        def,
      })),
    resolveWorkflowRef: async (ref: string) => {
      if (ref.endsWith(".workflow.json") && workflows[path.basename(ref)]) {
        return `tests/fixtures/workflows/${path.basename(ref)}`;
      }
      const match = Object.entries(workflows).find(([, def]) => def.id === ref);
      return match ? `tests/fixtures/workflows/${match[0]}` : null;
    },
    loadDefinition: async (p: string) => {
      const name = path.basename(p);
      const def = workflows[name];
      if (!def) throw new Error(`missing ${name}`);
      return def;
    },
  };
}

describe("workflow validator", () => {
  it("detects subworkflow cycles when resolveSubworkflows is true", async () => {
    const cycleA = loadFixture("cycle-a.workflow.json");
    const cycleB = loadFixture("cycle-b.workflow.json");
    const deps = makeValidatorDeps({
      "cycle-a.workflow.json": cycleA,
      "cycle-b.workflow.json": cycleB,
    });

    const result = await validateWorkflow(cycleA, deps, {
      resolveSubworkflows: true,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "cycle_detected")).toBe(true);
  });

  it("requires wikiId on wiki.ingest nodes", async () => {
    const registry = new NodeRegistry();
    registry.register({
      type: "wiki.ingest",
      label: "ingest",
      inputs: {},
      outputs: {},
      execute: async () => ({}),
    });

    const def: WorkflowDefinition = {
      schemaVersion: 1,
      id: "bad-ingest",
      name: "bad",
      nodes: [
        {
          id: "n1",
          type: "wiki.ingest",
          position: { x: 0, y: 0 },
          data: {},
        },
      ],
      edges: [],
    };

    const result = await validateWorkflow(def, {
      registry,
      listWorkflows: async () => [{ path: "x.workflow.json", def }],
      resolveWorkflowRef: async () => null,
      loadDefinition: async () => def,
    });

    expect(result.errors.some((e) => e.code === "schema_invalid")).toBe(true);
  });
});
