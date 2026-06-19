import type { WorkflowDefinition, WorkflowEdge } from "@shared/types/workflow";

/** Normalize persisted edges (legacy source/target aliases, invalid handles). */
export function normalizeWorkflowEdges(
  def: WorkflowDefinition,
): WorkflowEdge[] {
  const nodeIds = new Set(def.nodes.map((n) => n.id));

  return def.edges
    .map((raw) => normalizeWorkflowEdge(raw))
    .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to));
}

function normalizeWorkflowEdge(raw: WorkflowEdge): WorkflowEdge {
  const legacy = raw as WorkflowEdge & {
    source?: string;
    target?: string;
    sourcePort?: string;
    targetPort?: string;
  };

  const from = legacy.from ?? legacy.source ?? "";
  const to = legacy.to ?? legacy.target ?? "";

  const edge: WorkflowEdge = {
    id: raw.id || `e-${from}-${to}`,
    from,
    to,
  };

  const fromPort = legacy.fromPort ?? legacy.sourcePort;
  const toPort = legacy.toPort ?? legacy.targetPort;
  if (fromPort) edge.fromPort = fromPort;
  if (toPort) edge.toPort = toPort;

  return edge;
}

export function normalizeWorkflowDefinition(
  def: WorkflowDefinition,
): WorkflowDefinition {
  return {
    ...def,
    edges: normalizeWorkflowEdges(def),
  };
}
