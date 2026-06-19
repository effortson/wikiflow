import type { Edge, Node } from "@xyflow/react";
import type {
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowNode,
} from "@shared/types/workflow";
import { normalizeWorkflowDefinition } from "../schema/normalize-workflow";
import { getNodeCatalogEntry } from "./node-schemas";
import {
  defaultNodeId,
  resolveNodeId,
  rewriteNodeIdInConfig,
} from "./node-id";

export interface WorkflowNodeData extends Record<string, unknown> {
  nodeType: string;
  label: string;
  config: Record<string, unknown>;
  hasError?: boolean;
  errorMessages?: string[];
  /** Set during workflow run for canvas animation. */
  runPhase?: "idle" | "running" | "completed" | "failed";
}

export function createEmptyWorkflow(
  id = "new-workflow",
  name = "New workflow",
): WorkflowDefinition {
  const triggerId = defaultNodeId("trigger.manual", new Set());
  return {
    schemaVersion: 1,
    id,
    name,
    nodes: [
      {
        id: triggerId,
        type: "trigger.manual",
        position: { x: 80, y: 120 },
        data: {},
      },
    ],
    edges: [],
  };
}

export function definitionToFlow(def: WorkflowDefinition): {
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
} {
  const normalized = normalizeWorkflowDefinition(def);
  const errorNodeIds = new Set<string>();

  const nodes: Node<WorkflowNodeData>[] = normalized.nodes.map((node) => {
    const catalog = getNodeCatalogEntry(node.type);
    return {
      id: node.id,
      type: "workflowNode",
      position: node.position,
      data: {
        nodeType: node.type,
        label: catalog?.label ?? node.type,
        config: { ...node.data },
        hasError: errorNodeIds.has(node.id),
        errorMessages: [],
      },
    };
  });

  const edges: Edge[] = normalized.edges.map((edge) => workflowEdgeToFlowEdge(edge));

  return { nodes, edges };
}

function workflowEdgeToFlowEdge(edge: WorkflowEdge): Edge {
  const flowEdge: Edge = {
    id: edge.id,
    source: edge.from,
    target: edge.to,
    type: "default",
  };
  if (edge.fromPort) {
    flowEdge.sourceHandle = edge.fromPort;
    flowEdge.label = edge.fromPort;
  }
  if (edge.toPort) {
    flowEdge.targetHandle = edge.toPort;
  }
  return flowEdge;
}

export function applyValidationToNodes(
  nodes: Node<WorkflowNodeData>[],
  nodeErrors: Map<string, string[]>,
): Node<WorkflowNodeData>[] {
  return nodes.map((node) => {
    const messages = nodeErrors.get(node.id) ?? [];
    return {
      ...node,
      data: {
        ...node.data,
        hasError: messages.length > 0,
        errorMessages: messages,
      },
    };
  });
}

export function flowToDefinition(
  def: WorkflowDefinition,
  nodes: Node<WorkflowNodeData>[],
  edges: Edge[],
): WorkflowDefinition {
  const workflowNodes: WorkflowNode[] = nodes.map((node) => ({
    id: node.id,
    type: node.data.nodeType,
    position: node.position,
    data: { ...node.data.config },
  }));

  const workflowEdges: WorkflowEdge[] = edges.map((edge) => ({
    id: edge.id,
    from: edge.source,
    to: edge.target,
    ...(edge.sourceHandle ? { fromPort: edge.sourceHandle } : {}),
    ...(edge.targetHandle ? { toPort: edge.targetHandle } : {}),
  }));

  return {
    ...def,
    nodes: workflowNodes,
    edges: workflowEdges,
  };
}

export function createNodeFromCatalog(
  type: string,
  position: { x: number; y: number },
  existingIds: Iterable<string> = [],
): Node<WorkflowNodeData> {
  const catalog = getNodeCatalogEntry(type);
  const id = defaultNodeId(type, new Set(existingIds));
  return {
    id,
    type: "workflowNode",
    position,
    data: {
      nodeType: type,
      label: catalog?.label ?? type,
      config: {},
    },
  };
}

export function applyNodeIdChange(
  nodes: Node<WorkflowNodeData>[],
  edges: Edge[],
  oldId: string,
  draft: string,
): {
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
  newId: string;
  error?: string;
} {
  const node = nodes.find((entry) => entry.id === oldId);
  if (!node) {
    return { nodes, edges, newId: oldId, error: "Node not found" };
  }

  const existingIds = new Set(
    nodes.filter((entry) => entry.id !== oldId).map((entry) => entry.id),
  );
  const resolved = resolveNodeId(
    node.data.nodeType,
    draft,
    existingIds,
    oldId,
  );
  if (resolved.error) {
    return { nodes, edges, newId: oldId, error: resolved.error };
  }

  const newId = resolved.id;
  if (newId === oldId) {
    return { nodes, edges, newId };
  }

  const nextNodes = nodes.map((entry) => {
    if (entry.id === oldId) {
      return { ...entry, id: newId };
    }
    return {
      ...entry,
      data: {
        ...entry.data,
        config: rewriteNodeIdInConfig(entry.data.config, oldId, newId),
      },
    };
  });

  const nextEdges = edges.map((edge) => {
    const source = edge.source === oldId ? newId : edge.source;
    const target = edge.target === oldId ? newId : edge.target;
    if (source === edge.source && target === edge.target) {
      return edge;
    }
    return {
      ...edge,
      id: createEdgeId(source, target, edge.sourceHandle ?? undefined),
      source,
      target,
    };
  });

  return { nodes: nextNodes, edges: nextEdges, newId };
}

export function createEdgeId(source: string, target: string, port?: string): string {
  return `e-${source}-${target}${port ? `-${port}` : ""}`;
}

export function collectNodeValidationErrors(
  def: WorkflowDefinition,
  issues: { nodeId?: string; message: string }[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const issue of issues) {
    if (!issue.nodeId) continue;
    const list = map.get(issue.nodeId) ?? [];
    list.push(issue.message);
    map.set(issue.nodeId, list);
  }

  for (const node of def.nodes) {
    const local = validateNodeDataLocal(node.type, node.data);
    if (local.length > 0) {
      const list = map.get(node.id) ?? [];
      map.set(node.id, [...list, ...local]);
    }
  }

  return map;
}

function validateNodeDataLocal(
  type: string,
  data: Record<string, unknown>,
): string[] {
  const entry = getNodeCatalogEntry(type);
  if (!entry) return [];
  const errors: string[] = [];
  for (const field of entry.fields) {
    if (!field.required) continue;
    const value = data[field.key];
    if (value === undefined || value === null || value === "") {
      errors.push(field.label);
    }
  }
  return errors;
}
