import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseWorkflowDefinition } from "../src/workflow/service";
import {
  extractQueryWorkflowAnswer,
  validateQueryWorkflow,
} from "../src/workflow/shared/query-workflow";
import type { WorkflowDefinition } from "@shared/types/workflow";
import { createEmptyWorkflow } from "../src/workflow/ui/workflow-adapter";

function loadWorkflow(name: string): WorkflowDefinition {
  const raw = fs.readFileSync(
    path.join(process.cwd(), "workflows", name),
    "utf8",
  );
  return parseWorkflowDefinition(raw);
}

describe("validateQueryWorkflow", () => {
  it("accepts rag-multi-query workflow", () => {
    const def = loadWorkflow("rag-multi-query.workflow.json");
    const result = validateQueryWorkflow(def);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.shape.inputTriggerId).toBe("input");
      expect(result.shape.outputTextId).toBe("output");
    }
  });

  it("rejects manual trigger workflow", () => {
    const def = createEmptyWorkflow();
    const result = validateQueryWorkflow(def);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("trigger.user-input");
    }
  });

  it("rejects workflow without terminal output.text", () => {
    const def = loadWorkflow("rag-multi-query.workflow.json");
    const broken: WorkflowDefinition = {
      ...def,
      nodes: def.nodes.filter((node) => node.type !== "output.text"),
    };
    const result = validateQueryWorkflow(broken);
    expect(result.valid).toBe(false);
  });
});

describe("extractQueryWorkflowAnswer", () => {
  it("reads text from terminal output.text node outputs", () => {
    const def = loadWorkflow("rag-multi-query.workflow.json");
    const report = {
      runId: "r1",
      rootRunId: "r1",
      depth: 0,
      workflowId: def.id,
      status: "completed" as const,
      startedAt: new Date().toISOString(),
      outputs: {
        output: { text: "## 方案\n\n改造变频器。" },
      },
    };
    expect(extractQueryWorkflowAnswer(def, report)).toBe("## 方案\n\n改造变频器。");
  });
});
