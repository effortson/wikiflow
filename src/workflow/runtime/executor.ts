import type {
  RunReport,
  WorkflowDefinition,
  WorkflowEdge,
} from "@shared/types/workflow";
import type { WorkflowStepEvent } from "@shared/types/workflow-step";
import { snapshotWorkflowRecord } from "@shared/workflow-step-snapshot";
import type { NodeRegistry } from "../registry/node-registry";
import {
  mergeVariables,
  variablesToRecord,
  type WorkflowContext,
} from "./context";
import {
  branchResultKey,
  buildGraph,
  findStartNodes,
  isTriggerNode,
  topologicalSort,
  type WorkflowGraph,
} from "./graph";
import { resolveRecord } from "./template";

export interface ExecuteOptions {
  skipTriggers?: boolean;
  initialVariables?: Record<string, unknown>;
}

export interface ExecuteResult {
  outputs: Record<string, unknown>;
  childRuns: RunReport[];
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error("Workflow run cancelled");
  }
}

function isPredecessorSatisfied(
  graph: WorkflowGraph,
  nodeId: string,
  executed: Set<string>,
  branchResults: Map<string, boolean>,
  skipTriggers: boolean,
): boolean {
  const incoming = graph.incoming.get(nodeId) ?? [];
  if (incoming.length === 0) return true;

  for (const edge of incoming) {
    const fromNode = graph.nodes.get(edge.from);
    if (skipTriggers && fromNode && isTriggerNode(fromNode.type)) {
      continue;
    }

    if (!executed.has(edge.from)) return false;

    if (fromNode?.type === "branch.if") {
      const result = branchResults.get(edge.from);
      const port = edge.fromPort ?? "true";
      const expected = port === "true";
      if (result !== expected) return false;
    }
  }

  return true;
}

function gatherNodeInputs(
  graph: WorkflowGraph,
  nodeId: string,
  ctx: WorkflowContext,
  nodeOutputs: Map<string, Record<string, unknown>>,
): Record<string, unknown> {
  const inputs: Record<string, unknown> = {};
  const incoming = graph.incoming.get(nodeId) ?? [];

  for (const edge of incoming) {
    const upstream = nodeOutputs.get(edge.from);
    if (!upstream) continue;

    if (edge.fromPort && upstream[edge.fromPort] !== undefined) {
      inputs[edge.toPort ?? edge.fromPort] = upstream[edge.fromPort];
    } else if (edge.toPort && upstream[edge.toPort] !== undefined) {
      inputs[edge.toPort] = upstream[edge.toPort];
    } else {
      Object.assign(inputs, upstream);
    }
  }

  return inputs;
}

export async function executeWorkflow(
  def: WorkflowDefinition,
  ctx: WorkflowContext,
  registry: NodeRegistry,
  options: ExecuteOptions = {},
): Promise<ExecuteResult> {
  assertNotAborted(ctx.signal);

  if (options.initialVariables) {
    mergeVariables(ctx.variables, options.initialVariables);
  }
  if (def.variables) {
    mergeVariables(ctx.variables, def.variables);
  }

  const graph = buildGraph(def);
  const order = topologicalSort(graph);

  const rootTrigger = def.nodes.find((n) => isTriggerNode(n.type));
  if (rootTrigger && !ctx.triggerType) {
    ctx.triggerType = rootTrigger.type;
  }

  const executed = new Set<string>();
  const branchResults = new Map<string, boolean>();
  const nodeOutputs = new Map<string, Record<string, unknown>>();
  const childRuns: RunReport[] = [];

  const startIds = new Set(
    findStartNodes(graph, { skipTriggers: options.skipTriggers }),
  );

  for (const nodeId of order) {
    assertNotAborted(ctx.signal);

    const node = graph.nodes.get(nodeId);
    if (!node) continue;

    if (options.skipTriggers && isTriggerNode(node.type)) {
      continue;
    }

    const hasIncoming = (graph.incoming.get(nodeId)?.length ?? 0) > 0;
    if (!hasIncoming && !startIds.has(nodeId) && options.skipTriggers) {
      continue;
    }

    if (!isPredecessorSatisfied(graph, nodeId, executed, branchResults, Boolean(options.skipTriggers))) {
      continue;
    }

    const nodeType = registry.get(node.type);
    if (!nodeType) {
      throw new Error(`Unknown node type: ${node.type}`);
    }

    const inputs = gatherNodeInputs(graph, nodeId, ctx, nodeOutputs);
    const config = resolveRecord(node.data, ctx.variables);
    const startedAt = new Date().toISOString();

    publishStep(ctx, {
      runId: ctx.runId,
      rootRunId: ctx.rootRunId,
      workflowId: def.id,
      nodeId,
      nodeType: node.type,
      phase: "started",
      inputs: snapshotWorkflowRecord(inputs),
      config: snapshotWorkflowRecord(config),
      startedAt,
    });

    try {
      const outputs = await nodeType.execute(ctx, config, inputs);
      const finishedAt = new Date().toISOString();
      publishStep(ctx, {
        runId: ctx.runId,
        rootRunId: ctx.rootRunId,
        workflowId: def.id,
        nodeId,
        nodeType: node.type,
        phase: "completed",
        inputs: snapshotWorkflowRecord(inputs),
        config: snapshotWorkflowRecord(config),
        outputs: snapshotWorkflowRecord(outputs),
        startedAt,
        finishedAt,
        durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
      });

      nodeOutputs.set(nodeId, outputs);
      mergeVariables(ctx.variables, outputs);
      ctx.variables.set(nodeId, outputs);
      executed.add(nodeId);

      if (node.type === "branch.if") {
        const result = Boolean(outputs.result);
        branchResults.set(nodeId, result);
        ctx.variables.set(branchResultKey(nodeId), result);
      }

      if (node.type === "workflow.subworkflow" && outputs.__childRun) {
        childRuns.push(outputs.__childRun as RunReport);
      }
    } catch (err) {
      const finishedAt = new Date().toISOString();
      const message = err instanceof Error ? err.message : String(err);
      publishStep(ctx, {
        runId: ctx.runId,
        rootRunId: ctx.rootRunId,
        workflowId: def.id,
        nodeId,
        nodeType: node.type,
        phase: "failed",
        inputs: snapshotWorkflowRecord(inputs),
        config: snapshotWorkflowRecord(config),
        error: message,
        startedAt,
        finishedAt,
        durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
      });
      throw err;
    }
  }

  const unexecuted = [...graph.nodes.keys()].filter((id) => !executed.has(id));
  const required = unexecuted.filter((id) => {
    const node = graph.nodes.get(id)!;
    if (options.skipTriggers && isTriggerNode(node.type)) return false;
    return isReachable(graph, id, executed, branchResults, Boolean(options.skipTriggers));
  });

  if (required.length > 0) {
    throw new Error(
      `Workflow has unreachable or blocked nodes: ${required.join(", ")}`,
    );
  }

  return {
    outputs: variablesToRecord(ctx.variables),
    childRuns,
  };
}

function isReachable(
  graph: WorkflowGraph,
  nodeId: string,
  executed: Set<string>,
  branchResults: Map<string, boolean>,
  skipTriggers: boolean,
): boolean {
  if (executed.has(nodeId)) return false;
  return isPredecessorSatisfied(
    graph,
    nodeId,
    executed,
    branchResults,
    skipTriggers,
  );
}

export function outgoingBranchEdges(
  edges: WorkflowEdge[],
  fromId: string,
  branchResult: boolean,
): WorkflowEdge[] {
  const port = branchResult ? "true" : "false";
  return edges.filter(
    (e) =>
      e.from === fromId &&
      (e.fromPort === undefined || e.fromPort === port),
  );
}

function publishStep(ctx: WorkflowContext, step: WorkflowStepEvent): void {
  ctx.onStep?.(step);
}
