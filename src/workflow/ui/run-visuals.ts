import type { Edge, Node } from "@xyflow/react";
import type { WorkflowNodeRunSnapshot } from "@shared/types/workflow-step";
import type { WorkflowNodeData } from "./workflow-adapter";

export type NodeRunPhase = "idle" | "running" | "completed" | "failed";

export function stepPhaseToRunPhase(
  phase?: WorkflowNodeRunSnapshot["phase"],
): NodeRunPhase {
  if (!phase || phase === "started") {
    return phase === "started" ? "running" : "idle";
  }
  if (phase === "completed") return "completed";
  return "failed";
}

export function getEdgeRunClass(
  edge: Edge,
  nodeRunStates: Record<string, WorkflowNodeRunSnapshot>,
): string | undefined {
  const target = nodeRunStates[edge.target];
  const source = nodeRunStates[edge.source];
  if (!target && !source) return undefined;

  if (source?.phase === "started" || target?.phase === "started") {
    return "ef-edge--running";
  }
  if (target?.phase === "failed") return "ef-edge--failed";
  if (
    target?.phase === "completed" &&
    (source?.phase === "completed" || source?.phase === "failed")
  ) {
    return "ef-edge--completed";
  }
  return undefined;
}

function edgeRunStateFromClass(
  runClass: string | undefined,
): "running" | "completed" | "failed" | "idle" {
  if (runClass === "ef-edge--running") return "running";
  if (runClass === "ef-edge--completed") return "completed";
  if (runClass === "ef-edge--failed") return "failed";
  return "idle";
}

export function applyRunVisualsToNodes(
  nodes: Node<WorkflowNodeData>[],
  nodeRunStates: Record<string, WorkflowNodeRunSnapshot>,
): Node<WorkflowNodeData>[] {
  return nodes.map((node) => {
    const runPhase = stepPhaseToRunPhase(nodeRunStates[node.id]?.phase);
    if (node.data.runPhase === runPhase) return node;
    return {
      ...node,
      data: { ...node.data, runPhase },
    };
  });
}

export function applyRunVisualsToEdges(
  edges: Edge[],
  nodeRunStates: Record<string, WorkflowNodeRunSnapshot>,
): Edge[] {
  return edges.map((edge) => {
    const runClass = getEdgeRunClass(edge, nodeRunStates);
    const className = runClass ?? undefined;
    const runState = edgeRunStateFromClass(runClass);
    const data = { ...edge.data, runState };
    if (
      edge.type === "workflowRun" &&
      edge.className === className &&
      edge.data?.runState === runState
    ) {
      return edge;
    }
    return {
      ...edge,
      type: "workflowRun",
      className,
      animated: false,
      data,
    };
  });
}
