import type { WorkflowDefinition, WorkflowEdge, WorkflowNode } from "@shared/types/workflow";

export interface WorkflowGraph {
  nodes: Map<string, WorkflowNode>;
  incoming: Map<string, WorkflowEdge[]>;
  outgoing: Map<string, WorkflowEdge[]>;
}

export function buildGraph(def: WorkflowDefinition): WorkflowGraph {
  const nodes = new Map(def.nodes.map((n) => [n.id, n]));
  const incoming = new Map<string, WorkflowEdge[]>();
  const outgoing = new Map<string, WorkflowEdge[]>();

  for (const node of def.nodes) {
    incoming.set(node.id, []);
    outgoing.set(node.id, []);
  }

  for (const edge of def.edges) {
    incoming.get(edge.to)?.push(edge);
    outgoing.get(edge.from)?.push(edge);
  }

  return { nodes, incoming, outgoing };
}

export function isTriggerNode(type: string): boolean {
  return (
    type === "trigger.manual" ||
    type === "trigger.file-added" ||
    type === "trigger.user-input"
  );
}

export function findStartNodes(
  graph: WorkflowGraph,
  options: { skipTriggers?: boolean } = {},
): string[] {
  const starts: string[] = [];
  for (const [id, node] of graph.nodes) {
    const preds = graph.incoming.get(id) ?? [];
    if (preds.length > 0) continue;
    if (options.skipTriggers && isTriggerNode(node.type)) continue;
    starts.push(id);
  }
  return starts;
}

/** Kahn topological sort; throws on cycle. */
export function topologicalSort(graph: WorkflowGraph): string[] {
  const inDegree = new Map<string, number>();
  for (const id of graph.nodes.keys()) {
    inDegree.set(id, graph.incoming.get(id)?.length ?? 0);
  }

  const queue = [...graph.nodes.keys()].filter(
    (id) => (inDegree.get(id) ?? 0) === 0,
  );
  const order: string[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);

    for (const edge of graph.outgoing.get(id) ?? []) {
      const next = edge.to;
      const deg = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, deg);
      if (deg === 0) queue.push(next);
    }
  }

  if (order.length !== graph.nodes.size) {
    throw new Error("cycle_detected");
  }

  return order;
}

export function detectCycle(graph: WorkflowGraph): boolean {
  try {
    topologicalSort(graph);
    return false;
  } catch {
    return true;
  }
}

export function branchResultKey(nodeId: string): string {
  return `__branch.${nodeId}`;
}
