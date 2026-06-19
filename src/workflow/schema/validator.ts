import type {
  ValidateOptions,
  WorkflowDefinition,
} from "@shared/types/workflow";
import type { ValidationIssue, ValidationResult } from "@shared/types/validation";
import type { NodeRegistry } from "../registry/node-registry";
import { buildGraph, detectCycle } from "../runtime/graph";
import { isValidNodeId } from "../ui/node-id";

export interface WorkflowIndexEntry {
  path: string;
  def: WorkflowDefinition;
}

export interface ValidatorDeps {
  registry: NodeRegistry;
  listWorkflows: () => Promise<WorkflowIndexEntry[]>;
  resolveWorkflowRef: (ref: string) => Promise<string | null>;
  loadDefinition: (path: string) => Promise<WorkflowDefinition>;
}

export async function validateWorkflow(
  def: WorkflowDefinition,
  deps: ValidatorDeps,
  options: ValidateOptions = {},
): Promise<ValidationResult> {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!def.id) {
    errors.push({ code: "schema_invalid", message: "Workflow id is required" });
  }
  if (!def.nodes?.length) {
    errors.push({
      code: "schema_invalid",
      message: "Workflow must have at least one node",
    });
  }

  const graph = buildGraph(def);
  const nodeIds = new Set(def.nodes.map((n) => n.id));
  const seenNodeIds = new Set<string>();

  for (const node of def.nodes) {
    if (!node.id) {
      errors.push({
        code: "schema_invalid",
        message: "Each node requires an id",
        nodeId: node.id,
      });
      continue;
    }
    if (!isValidNodeId(node.id)) {
      errors.push({
        code: "schema_invalid",
        message: `Invalid node id "${node.id}"`,
        nodeId: node.id,
      });
    }
    if (seenNodeIds.has(node.id)) {
      errors.push({
        code: "schema_invalid",
        message: `Duplicate node id "${node.id}"`,
        nodeId: node.id,
      });
    }
    seenNodeIds.add(node.id);
  }

  for (const edge of def.edges) {
    if (!nodeIds.has(edge.from)) {
      errors.push({
        code: "dangling_edge",
        message: `Edge ${edge.id} references missing from node ${edge.from}`,
      });
    }
    if (!nodeIds.has(edge.to)) {
      errors.push({
        code: "dangling_edge",
        message: `Edge ${edge.id} references missing to node ${edge.to}`,
      });
    }
  }

  for (const node of def.nodes) {
    if (!deps.registry.has(node.type)) {
      errors.push({
        code: "unknown_node_type",
        message: `Unknown node type: ${node.type}`,
        nodeId: node.id,
      });
    }

    if (node.type === "branch.if") {
      const outgoing = graph.outgoing.get(node.id) ?? [];
      for (const edge of outgoing) {
        if (!edge.fromPort) {
          warnings.push({
            code: "port_mismatch",
            message: `branch.if edge ${edge.id} is missing fromPort (defaults to true)`,
            nodeId: node.id,
          });
        }
        if (edge.fromPort && edge.fromPort !== "true" && edge.fromPort !== "false") {
          errors.push({
            code: "port_mismatch",
            message: `branch.if edge ${edge.id} has invalid fromPort "${edge.fromPort}"`,
            nodeId: node.id,
          });
        }
      }
    }

    if (node.type === "workflow.subworkflow") {
      const ref = node.data.workflowRef as string | undefined;
      if (!ref) {
        errors.push({
          code: "schema_invalid",
          message: "workflow.subworkflow requires workflowRef",
          nodeId: node.id,
        });
      }
    }

    if (
      node.type === "wiki.ingest" ||
      node.type === "wiki.query" ||
      node.type === "wiki.query-batch"
    ) {
      if (!node.data.wikiId) {
        errors.push({
          code: "schema_invalid",
          message: `${node.type} requires wikiId in node data`,
          nodeId: node.id,
        });
      }
    }
  }

  if (detectCycle(graph)) {
    errors.push({
      code: "cycle_detected",
      message: "Workflow graph contains a cycle",
    });
  }

  const all = await deps.listWorkflows();
  const sameId = all.filter((e) => e.def.id === def.id);
  if (sameId.length > 1) {
    errors.push({
      code: "duplicate_workflow_id",
      message: `Duplicate workflow id "${def.id}"`,
    });
  }

  if (options.resolveSubworkflows) {
    await validateSubworkflowGraph(def, deps, errors, new Set());
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

async function validateSubworkflowGraph(
  def: WorkflowDefinition,
  deps: ValidatorDeps,
  errors: ValidationIssue[],
  stack: Set<string>,
): Promise<void> {
  if (stack.has(def.id)) {
    errors.push({
      code: "cycle_detected",
      message: `Subworkflow cycle detected at ${def.id}`,
    });
    return;
  }

  stack.add(def.id);

  for (const node of def.nodes) {
    if (node.type !== "workflow.subworkflow") continue;
    const ref = node.data.workflowRef as string | undefined;
    if (!ref) continue;

    const path = await deps.resolveWorkflowRef(ref);
    if (!path) {
      errors.push({
        code: "subworkflow_not_found",
        message: `Subworkflow not found: ${ref}`,
        nodeId: node.id,
        workflowRef: ref,
      });
      continue;
    }

    const child = await deps.loadDefinition(path);
    await validateSubworkflowGraph(child, deps, errors, new Set(stack));
  }
}
