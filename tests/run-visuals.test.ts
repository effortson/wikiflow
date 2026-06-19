import { describe, expect, it } from "vitest";
import type { Edge } from "@xyflow/react";
import type { WorkflowNodeRunSnapshot } from "../src/shared/types/workflow-step";
import {
  applyRunVisualsToEdges,
  applyRunVisualsToNodes,
  getEdgeRunClass,
  stepPhaseToRunPhase,
} from "../src/workflow/ui/run-visuals";

function snap(
  nodeId: string,
  phase: WorkflowNodeRunSnapshot["phase"],
): WorkflowNodeRunSnapshot {
  return {
    nodeType: "test",
    phase,
    startedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("run visuals", () => {
  it("maps step phases to run phases", () => {
    expect(stepPhaseToRunPhase(undefined)).toBe("idle");
    expect(stepPhaseToRunPhase("started")).toBe("running");
    expect(stepPhaseToRunPhase("completed")).toBe("completed");
    expect(stepPhaseToRunPhase("failed")).toBe("failed");
  });

  it("classifies edges by target run state", () => {
    const edge: Edge = { id: "e1", source: "trigger", target: "pick" };
    expect(getEdgeRunClass(edge, {})).toBeUndefined();
    expect(
      getEdgeRunClass(edge, {
        trigger: snap("trigger", "completed"),
        pick: snap("pick", "started"),
      }),
    ).toBe("ef-edge--running");
    expect(
      getEdgeRunClass(edge, {
        trigger: snap("trigger", "completed"),
        pick: snap("pick", "completed"),
      }),
    ).toBe("ef-edge--completed");
  });

  it("applies run phase to nodes and edge classes", () => {
    const nodes = [
      {
        id: "trigger",
        type: "workflowNode",
        position: { x: 0, y: 0 },
        data: { nodeType: "trigger.manual", label: "Trigger", config: {} },
      },
    ];
    const edges: Edge[] = [{ id: "e1", source: "trigger", target: "pick" }];
    const states = { trigger: snap("trigger", "completed") };

    const visualNodes = applyRunVisualsToNodes(nodes, states);
    expect(visualNodes[0].data.runPhase).toBe("completed");

    const visualEdges = applyRunVisualsToEdges(edges, {
      ...states,
      pick: snap("pick", "started"),
    });
    expect(visualEdges[0].className).toBe("ef-edge--running");
    expect(visualEdges[0].type).toBe("workflowRun");
    expect(visualEdges[0].data?.runState).toBe("running");
  });

  it("marks outgoing edges from a running node", () => {
    const edge: Edge = { id: "e1", source: "pick", target: "extract" };
    expect(
      getEdgeRunClass(edge, {
        pick: snap("pick", "started"),
      }),
    ).toBe("ef-edge--running");
  });
});
