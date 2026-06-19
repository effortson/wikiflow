import type { RunReport, WorkflowDefinition } from "@shared/types/workflow";
import {
  buildGraph,
  findStartNodes,
  topologicalSort,
} from "../runtime/graph";

export interface QueryWorkflowShape {
  inputTriggerId: string;
  outputTextId: string;
}

export function validateQueryWorkflow(
  def: WorkflowDefinition,
): { valid: true; shape: QueryWorkflowShape } | { valid: false; error: string } {
  const graph = buildGraph(def);
  const starts = findStartNodes(graph);

  if (starts.length !== 1) {
    return {
      valid: false,
      error:
        starts.length === 0
          ? "Workflow has no start node"
          : "Query workflow must have exactly one start node (trigger.user-input)",
    };
  }

  const startNode = graph.nodes.get(starts[0]);
  if (!startNode || startNode.type !== "trigger.user-input") {
    return {
      valid: false,
      error: "Query workflow must start with trigger.user-input",
    };
  }

  const terminals = def.nodes.filter((node) => {
    const outgoing = graph.outgoing.get(node.id) ?? [];
    return outgoing.length === 0;
  });

  if (terminals.length !== 1) {
    return {
      valid: false,
      error:
        terminals.length === 0
          ? "Workflow has no terminal node"
          : "Query workflow must end with a single output.text node",
    };
  }

  const terminal = terminals[0];
  if (terminal.type !== "output.text") {
    return {
      valid: false,
      error: "Query workflow must end with output.text",
    };
  }

  if (!hasPath(graph, startNode.id, terminal.id)) {
    return {
      valid: false,
      error: "output.text is not reachable from trigger.user-input",
    };
  }

  return {
    valid: true,
    shape: {
      inputTriggerId: startNode.id,
      outputTextId: terminal.id,
    },
  };
}

export function orderedQueryWorkflowNodeIds(def: WorkflowDefinition): string[] {
  const graph = buildGraph(def);
  return topologicalSort(graph);
}

export function extractQueryWorkflowAnswer(
  def: WorkflowDefinition,
  report: RunReport,
): string | undefined {
  const checked = validateQueryWorkflow(def);
  if (!checked.valid) return undefined;

  const { outputTextId } = checked.shape;
  const fromOutputs = readOutputText(report.outputs?.[outputTextId]);
  if (fromOutputs) return fromOutputs;

  return undefined;
}

function readOutputText(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const text = (value as { text?: unknown }).text;
  if (text === undefined || text === null) return undefined;
  const rendered = String(text).trim();
  return rendered || undefined;
}

function hasPath(
  graph: ReturnType<typeof buildGraph>,
  fromId: string,
  toId: string,
): boolean {
  if (fromId === toId) return true;

  const visited = new Set<string>();
  const queue = [fromId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (id === toId) return true;
    if (visited.has(id)) continue;
    visited.add(id);

    for (const edge of graph.outgoing.get(id) ?? []) {
      queue.push(edge.to);
    }
  }

  return false;
}
