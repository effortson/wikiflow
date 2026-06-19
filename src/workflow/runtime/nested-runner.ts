import type {
  RunReport,
  WorkflowDefinition,
} from "@shared/types/workflow";
import type { PluginSettings } from "../../core/config/settings";
import type { NodeRegistry } from "../registry/node-registry";
import {
  createWorkflowContext,
  mergeVariables,
  type WorkflowContext,
  type WorkflowServices,
} from "./context";
import { executeWorkflow } from "./executor";
import { resolveTemplate } from "./template";
import { isWorkflowFalsy } from "@shared/workflow-boolean";

export interface NestedRunnerDeps {
  getSettings: () => PluginSettings;
  services: WorkflowServices;
  registry: NodeRegistry;
  loadDefinition: (ref: string) => Promise<WorkflowDefinition>;
  resolveWorkflowRef: (ref: string) => Promise<string | null>;
  validateDefinition: (
    def: WorkflowDefinition,
    options?: { resolveSubworkflows?: boolean },
  ) => Promise<{ valid: boolean; errors: { message: string }[] }>;
  saveRunReport: (report: RunReport) => Promise<void>;
  onChildDone?: (parentRunId: string, report: RunReport) => void;
  createRunId: () => string;
}

export async function runSubworkflow(
  parentCtx: WorkflowContext,
  config: Record<string, unknown>,
  deps: NestedRunnerDeps,
): Promise<Record<string, unknown>> {
  const workflowRef = config.workflowRef as string | undefined;
  if (!workflowRef) {
    throw new Error("workflow.subworkflow requires workflowRef");
  }

  const settings = deps.getSettings();
  const depth = parentCtx.depth + 1;
  if (depth > settings.maxWorkflowNestingDepth) {
    throw new Error(
      `Subworkflow nesting depth ${depth} exceeds maxWorkflowNestingDepth (${settings.maxWorkflowNestingDepth})`,
    );
  }

  const definitionPath = await deps.resolveWorkflowRef(workflowRef);
  if (!definitionPath) {
    throw new Error(`Subworkflow not found: ${workflowRef}`);
  }

  const childDef = await deps.loadDefinition(definitionPath);

  const validation = await deps.validateDefinition(childDef, {
    resolveSubworkflows: true,
  });
  if (!validation.valid) {
    throw new Error(
      validation.errors.map((e) => e.message).join("; ") ||
        "Subworkflow validation failed",
    );
  }

  if (parentCtx.callStack.includes(childDef.id)) {
    throw new Error(`Subworkflow cycle detected: ${childDef.id}`);
  }

  const inputMapping = (config.inputMapping as Record<string, string>) ?? {};
  const childInputs: Record<string, unknown> = {};
  for (const [childPort, template] of Object.entries(inputMapping)) {
    childInputs[childPort] = resolveTemplate(template, parentCtx.variables);
  }

  const runId = deps.createRunId();
  const controller = new AbortController();
  const onParentAbort = () => controller.abort();
  parentCtx.signal.addEventListener("abort", onParentAbort);

  const childCtx = createWorkflowContext({
    runId,
    rootRunId: parentCtx.rootRunId,
    parentRunId: parentCtx.runId,
    depth,
    workflowId: childDef.id,
    callStack: parentCtx.callStack,
    inheritedVariables: childInputs,
    wikiId: parentCtx.wikiId,
    signal: controller.signal,
    services: deps.services,
    onStep: parentCtx.onStep,
  });

  const startedAt = new Date().toISOString();
  let report: RunReport;

  try {
    const { outputs, childRuns } = await executeWorkflow(
      childDef,
      childCtx,
      deps.registry,
      { skipTriggers: true, initialVariables: childInputs },
    );

    report = {
      runId,
      rootRunId: parentCtx.rootRunId,
      parentRunId: parentCtx.runId,
      depth,
      workflowId: childDef.id,
      status: "completed",
      childRuns,
      outputs,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  } catch (err) {
    const failParent = !isWorkflowFalsy(config.failParentOnError);
    const message = err instanceof Error ? err.message : String(err);
    const cancelled = controller.signal.aborted || parentCtx.signal.aborted;

    report = {
      runId,
      rootRunId: parentCtx.rootRunId,
      parentRunId: parentCtx.runId,
      depth,
      workflowId: childDef.id,
      status: cancelled ? "cancelled" : "failed",
      error: message,
      startedAt,
      finishedAt: new Date().toISOString(),
    };

    await deps.saveRunReport(report);
    deps.onChildDone?.(parentCtx.runId, report);
    parentCtx.signal.removeEventListener("abort", onParentAbort);

    if (failParent && !cancelled) {
      throw err;
    }

    return { __childRun: report };
  } finally {
    parentCtx.signal.removeEventListener("abort", onParentAbort);
  }

  await deps.saveRunReport(report);
  deps.onChildDone?.(parentCtx.runId, report);

  const outputMapping =
    (config.outputMapping as Record<string, string> | undefined) ?? {};
  const parentOutputs: Record<string, unknown> = { __childRun: report };

  if (Object.keys(outputMapping).length > 0) {
    for (const [childPort, parentKey] of Object.entries(outputMapping)) {
      if (report.outputs?.[childPort] !== undefined) {
        parentOutputs[parentKey] = report.outputs[childPort];
      }
    }
  } else if (report.outputs) {
    mergeVariables(parentCtx.variables, report.outputs);
    Object.assign(parentOutputs, report.outputs);
  }

  return parentOutputs;
}
